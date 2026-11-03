import { describe, expect, it } from 'vitest';
import { DEFAULT_TOURNAMENT_CONFIG } from './config';
import { planDivisions } from './divisions';

describe('planDivisions A1', () => {
  it('splits 30 entries into 3 groups', () => {
    const ranked = Array.from({ length: 30 }, (_, i) => ({ id: `e${i + 1}`, rank: i + 1 }));
    const plan = planDivisions(ranked, DEFAULT_TOURNAMENT_CONFIG);
    expect(plan).toHaveLength(3);
    expect(plan.reduce((sum, d) => sum + d.entryIds.length, 0)).toBe(30);
  });

  it('stays proportional for fewer than 30', () => {
    const ranked = Array.from({ length: 18 }, (_, i) => ({ id: `e${i + 1}`, rank: i + 1 }));
    const plan = planDivisions(ranked, DEFAULT_TOURNAMENT_CONFIG);
    expect(plan.length).toBeGreaterThanOrEqual(1);
    expect(plan.reduce((sum, d) => sum + d.entryIds.length, 0)).toBe(18);
  });

  it('handles more than 30', () => {
    const ranked = Array.from({ length: 41 }, (_, i) => ({ id: `e${i + 1}`, rank: i + 1 }));
    const plan = planDivisions(ranked, DEFAULT_TOURNAMENT_CONFIG);
    expect(plan).toHaveLength(3);
    expect(plan.reduce((sum, d) => sum + d.entryIds.length, 0)).toBe(41);
  });
});
