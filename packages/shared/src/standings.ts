export type StandingRow = {
  entryId: string;
  played: number;
  wins: number;
  losses: number;
  techLosses: number;
  byes: number;
  setsWon: number;
  setsLost: number;
  gamesWon: number;
  gamesLost: number;
  drawLot: number;
};

export function compareStandings(a: StandingRow, b: StandingRow, headToHeadWinner?: string | null): number {
  if (b.wins !== a.wins) return b.wins - a.wins;
  if (headToHeadWinner === a.entryId) return -1;
  if (headToHeadWinner === b.entryId) return 1;
  const setA = a.setsWon - a.setsLost;
  const setB = b.setsWon - b.setsLost;
  if (setB !== setA) return setB - setA;
  const gameA = a.gamesWon - a.gamesLost;
  const gameB = b.gamesWon - b.gamesLost;
  if (gameB !== gameA) return gameB - gameA;
  if (a.techLosses !== b.techLosses) return a.techLosses - b.techLosses;
  return a.drawLot - b.drawLot;
}

export function rankStandings(rows: StandingRow[], headToHead: Map<string, string> = new Map()): Array<StandingRow & { rank: number }> {
  const sorted = [...rows].sort((a, b) => {
    let h2h: string | null = null;
    const sameWins = rows.filter((row) => row.wins === a.wins && row.wins === b.wins);
    if (sameWins.length === 2) {
      const key = a.entryId < b.entryId ? `${a.entryId}|${b.entryId}` : `${b.entryId}|${a.entryId}`;
      h2h = headToHead.get(key) ?? null;
    }
    return compareStandings(a, b, h2h);
  });
  return sorted.map((row, index) => ({ ...row, rank: index + 1 }));
}
