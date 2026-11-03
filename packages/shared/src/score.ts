export type SetScore = { gamesA: number; gamesB: number };

const SETS: Array<[number, number]> = [
  [6, 0],
  [6, 1],
  [6, 2],
  [6, 3],
  [6, 4],
  [7, 5],
  [7, 6],
];

export function randomPadelSets(random: () => number, winner: 'A' | 'B'): SetScore[] {
  const pickWin = (): SetScore => {
    const [w, l] = SETS[Math.floor(random() * SETS.length)]!;
    return winner === 'A' ? { gamesA: w, gamesB: l } : { gamesA: l, gamesB: w };
  };
  const pickLose = (): SetScore => {
    const [w, l] = SETS[Math.floor(random() * SETS.length)]!;
    return winner === 'A' ? { gamesA: l, gamesB: w } : { gamesA: w, gamesB: l };
  };
  if (random() < 0.65) return [pickWin(), pickWin()];
  return [pickWin(), pickLose(), pickWin()];
}

export function tallySets(sets: SetScore[]): { setsA: number; setsB: number; gamesA: number; gamesB: number } {
  const acc = { setsA: 0, setsB: 0, gamesA: 0, gamesB: 0 };
  for (const set of sets) {
    if (set.gamesA > set.gamesB) acc.setsA += 1;
    else acc.setsB += 1;
    acc.gamesA += set.gamesA;
    acc.gamesB += set.gamesB;
  }
  return acc;
}
