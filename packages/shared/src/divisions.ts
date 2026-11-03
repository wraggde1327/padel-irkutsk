import type { TournamentConfig } from './config';

export type RankedEntry = {
  id: string;
  rank: number;
};

export type PlannedDivision = {
  number: number;
  title: string;
  entryIds: string[];
  filledFromPlaces: number[];
};

/**
 * Пропорциональная нарезка дивизионов. Если на 3 не хватает —
 * добиваем с мест из fillFromPlaces (3 и 4 по умолчанию). A1
 */
export function planDivisions(ranked: RankedEntry[], config: TournamentConfig): PlannedDivision[] {
  const sorted = [...ranked].sort((a, b) => a.rank - b.rank);
  const count = Math.max(1, config.divisionsCount);
  if (sorted.length === 0) return [];

  const numeric = config.divisionSizes.filter((s): s is number => typeof s === 'number');
  const target = numeric.length > 0 ? numeric[0]! : Math.max(4, Math.ceil(sorted.length / count));
  const minViable = Math.max(2, Math.floor(target / 2));

  if (sorted.length < count * minViable) {
    const actual = Math.max(1, Math.min(count, Math.floor(sorted.length / minViable) || 1));
    return splitProportional(sorted, actual, config.fillFromPlaces);
  }

  return splitProportional(sorted, count, config.fillFromPlaces);
}

function splitProportional(
  ranked: RankedEntry[],
  count: number,
  fillFromPlaces: number[],
): PlannedDivision[] {
  const base = Math.floor(ranked.length / count);
  const extra = ranked.length % count;
  const sizes = Array.from({ length: count }, (_, i) => base + (i < extra ? 1 : 0));
  const result: PlannedDivision[] = [];
  let cursor = 0;
  for (let i = 0; i < count; i += 1) {
    const slice = ranked.slice(cursor, cursor + sizes[i]!).map((row) => row.id);
    cursor += sizes[i]!;
    const filled = slice
      .map((_, idx) => idx + 1)
      .filter((place) => fillFromPlaces.includes(place) && i === count - 1);
    result.push({
      number: i + 1,
      title: `Дивизион ${i + 1}`,
      entryIds: slice,
      filledFromPlaces: i === count - 1 ? filled : [],
    });
  }
  return result;
}
