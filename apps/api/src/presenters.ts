import { formatPerson } from './sandbox';

type SidePayload = {
  id: string;
  entries: Array<{
    entry: {
      type: string;
      captain: { firstName: string; lastName: string | null };
      partner: { firstName: string; lastName: string | null } | null;
    };
  }>;
};

export function sideNames(side: SidePayload | null | undefined): string[] {
  if (!side) return [];
  const names: string[] = [];
  for (const row of side.entries) {
    names.push(row.entry.captain.firstName);
    if (row.entry.type === 'PAIR' && row.entry.partner) names.push(row.entry.partner.firstName);
  }
  return names;
}

export function sideLabel(side: SidePayload | null | undefined): string {
  if (!side) return 'BYE';
  return side.entries
    .map((row) => {
      const entry = row.entry;
      if (entry.type === 'PAIR') {
        return `${formatPerson(entry.captain)} / ${entry.partner ? formatPerson(entry.partner) : '…'}`;
      }
      return formatPerson(entry.captain);
    })
    .join(' + ');
}

export function serializeMatch(match: {
  id: string;
  status: string;
  winnerSideId: string | null;
  sideAId: string;
  sideBId: string | null;
  playedAt: Date | null;
  deadlineAt: Date;
  sets: Array<{ number: number; gamesA: number; gamesB: number }>;
  sideA: SidePayload;
  sideB: SidePayload | null;
  round: { title: string; stage: string; number: number };
  division: { title: string; number: number } | null;
}) {
  const sets = [...match.sets].sort((a, b) => a.number - b.number);
  return {
    id: match.id,
    status: match.status,
    title: match.round.title,
    stage: match.round.stage,
    division: match.division?.title ?? null,
    divisionNumber: match.division?.number ?? null,
    isBye: match.status === 'BYE' || !match.sideBId,
    sideA: { id: match.sideAId, label: sideLabel(match.sideA), names: sideNames(match.sideA) },
    sideB: match.sideB ? { id: match.sideBId!, label: sideLabel(match.sideB), names: sideNames(match.sideB) } : null,
    sets: sets.map((set) => ({ gamesA: set.gamesA, gamesB: set.gamesB })),
    score: sets.map((set) => `${set.gamesA}:${set.gamesB}`).join(' '),
    winner: match.winnerSideId === match.sideAId ? 'A' : match.winnerSideId && match.winnerSideId === match.sideBId ? 'B' : null,
    playedAt: match.playedAt,
    deadlineAt: match.deadlineAt,
  };
}
