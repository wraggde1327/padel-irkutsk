import { describe, expect, it } from 'vitest';
import { bracketSize, seedOrder } from './bracket';
import { randomPadelSets, tallySets } from './score';
import { mulberry32 } from './rng';
import { rankStandings } from './standings';

describe('seedOrder §8.8', () => {
  it('builds standard 4/8/16 brackets', () => {
    expect(seedOrder(4)).toEqual([1, 4, 2, 3]);
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    expect(seedOrder(16)[0]).toBe(1);
    expect(seedOrder(16)[1]).toBe(16);
    expect(bracketSize(10)).toBe(16);
  });
});

describe('randomPadelSets', () => {
  it('gives the chosen side two set wins', () => {
    const sets = randomPadelSets(mulberry32(1), 'A');
    const tally = tallySets(sets);
    expect(tally.setsA).toBe(2);
    expect(tally.setsB).toBeLessThan(2);
  });
});

describe('rankStandings', () => {
  it('orders by wins then set difference', () => {
    const ranked = rankStandings([
      { entryId: 'a', played: 2, wins: 1, losses: 1, techLosses: 0, byes: 0, setsWon: 2, setsLost: 2, gamesWon: 12, gamesLost: 12, drawLot: 0.9 },
      { entryId: 'b', played: 2, wins: 2, losses: 0, techLosses: 0, byes: 0, setsWon: 4, setsLost: 0, gamesWon: 24, gamesLost: 4, drawLot: 0.1 },
    ]);
    expect(ranked.map((row) => row.entryId)).toEqual(['b', 'a']);
  });
});
