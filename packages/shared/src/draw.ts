import { hashSeed, mulberry32, shuffleInPlace } from './rng';

export type DrawEntry = {
  id: string;
  type: 'PAIR' | 'SOLO';
  byeCount: number;
};

export type DrawSide = {
  id: string;
  entryIds: string[];
  isTemporary: boolean;
  partnerRepeat: boolean;
};

export type DrawMatch = {
  sideAId: string;
  sideBId: string | null;
  isBye: boolean;
};

export type DrawPreview = {
  seed: string;
  sides: DrawSide[];
  matches: DrawMatch[];
  warnings: string[];
};

type History = {
  partnered: Array<[string, string]>;
  opposed: Array<[string, string]>;
};

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function toSet(pairs: Array<[string, string]>): Set<string> {
  return new Set(pairs.map(([a, b]) => pairKey(a, b)));
}

/** Жеребьёвка квалификационного тура. Черновик: сгенерировать → проверить → сохранить. §8.2, A14 */
export function generateQualDraw(
  entries: DrawEntry[],
  history: History,
  seed: string,
  options: { maxAttempts?: number } = {},
): DrawPreview {
  const random = mulberry32(hashSeed(seed));
  const warnings: string[] = [];
  const partnered = toSet(history.partnered);
  const opposed = toSet(history.opposed);
  const maxAttempts = options.maxAttempts ?? 2000;

  const pairs = entries.filter((e) => e.type === 'PAIR');
  const solos = entries.filter((e) => e.type === 'SOLO');

  const sides: DrawSide[] = pairs.map((entry) => ({
    id: `side-${entry.id}`,
    entryIds: [entry.id],
    isTemporary: false,
    partnerRepeat: false,
  }));

  const shuffledSolos = shuffleInPlace([...solos], random);
  const usedSolo = new Set<string>();
  let partnerRepeats = 0;

  for (const solo of shuffledSolos) {
    if (usedSolo.has(solo.id)) continue;
    const candidate = shuffledSolos.find(
      (other) =>
        other.id !== solo.id &&
        !usedSolo.has(other.id) &&
        !partnered.has(pairKey(solo.id, other.id)),
    );
    const fallback = shuffledSolos.find((other) => other.id !== solo.id && !usedSolo.has(other.id));
    const mate = candidate ?? fallback;
    if (!mate) {
      sides.push({
        id: `side-solo-${solo.id}`,
        entryIds: [solo.id],
        isTemporary: true,
        partnerRepeat: false,
      });
      usedSolo.add(solo.id);
      continue;
    }
    const repeat = partnered.has(pairKey(solo.id, mate.id));
    if (repeat) partnerRepeats += 1;
    sides.push({
      id: `side-${solo.id}-${mate.id}`,
      entryIds: [solo.id, mate.id],
      isTemporary: true,
      partnerRepeat: repeat,
    });
    usedSolo.add(solo.id);
    usedSolo.add(mate.id);
  }

  if (partnerRepeats > 0) {
    warnings.push(`Повтор напарников: ${partnerRepeats}`);
  }

  const byePriority = [...sides].sort((a, b) => {
    const byeA = a.entryIds.reduce((sum, id) => sum + (entries.find((e) => e.id === id)?.byeCount ?? 0), 0);
    const byeB = b.entryIds.reduce((sum, id) => sum + (entries.find((e) => e.id === id)?.byeCount ?? 0), 0);
    return byeA - byeB || a.id.localeCompare(b.id);
  });

  const matches: DrawMatch[] = [];
  const pool = shuffleInPlace([...sides], random);

  if (pool.length % 2 === 1) {
    const byeSide = byePriority.find((side) => pool.some((item) => item.id === side.id)) ?? pool[0]!;
    matches.push({ sideAId: byeSide.id, sideBId: null, isBye: true });
    const idx = pool.findIndex((side) => side.id === byeSide.id);
    if (idx >= 0) pool.splice(idx, 1);
  }

  let repeats = Number.POSITIVE_INFINITY;
  let best: Array<[DrawSide, DrawSide]> = [];

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const order = shuffleInPlace([...pool], random);
    const pairing: Array<[DrawSide, DrawSide]> = [];
    let localRepeats = 0;
    for (let i = 0; i < order.length; i += 2) {
      const a = order[i]!;
      const b = order[i + 1]!;
      const clash = a.entryIds.some((ea) => b.entryIds.some((eb) => opposed.has(pairKey(ea, eb))));
      if (clash) localRepeats += 1;
      pairing.push([a, b]);
    }
    if (localRepeats < repeats) {
      repeats = localRepeats;
      best = pairing;
      if (repeats === 0) break;
    }
  }

  if (repeats > 0 && best.length > 0) {
    warnings.push(`Повторы соперников: ${repeats}`);
  }

  for (const [a, b] of best) {
    matches.push({ sideAId: a.id, sideBId: b.id, isBye: false });
  }

  return { seed, sides, matches, warnings };
}
