export function bracketSize(n: number): number {
  let size = 2;
  while (size < n) size *= 2;
  return size;
}

/** Стандартный посев single-elim: 1–M, 2–(M−1), … §8.8 */
export function seedOrder(size: number): number[] {
  if (size < 2) return [1];
  let seeds = [1, 2];
  while (seeds.length < size) {
    const next: number[] = [];
    const sum = seeds.length * 2 + 1;
    for (const seed of seeds) {
      next.push(seed);
      next.push(sum - seed);
    }
    seeds = next;
  }
  return seeds;
}

export function playoffRoundTitle(remainingSides: number): string {
  if (remainingSides <= 2) return 'Финал';
  if (remainingSides <= 4) return '1/2 финала';
  if (remainingSides <= 8) return '1/4 финала';
  if (remainingSides <= 16) return '1/8 финала';
  return `Раунд на ${remainingSides}`;
}
