import { describe, expect, it } from 'vitest';
import { generateQualDraw, type DrawEntry } from './draw';

function pairs(n: number): DrawEntry[] {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, type: 'PAIR' as const, byeCount: 0 }));
}

describe('generateQualDraw §8.2', () => {
  it('is reproducible for the same seed', () => {
    const entries = pairs(30);
    const a = generateQualDraw(entries, { partnered: [], opposed: [] }, 'seed-a');
    const b = generateQualDraw(entries, { partnered: [], opposed: [] }, 'seed-a');
    expect(a.matches).toEqual(b.matches);
    expect(a.sides).toEqual(b.sides);
  });

  it('changes when the seed changes', () => {
    const entries = pairs(30);
    const a = generateQualDraw(entries, { partnered: [], opposed: [] }, 'seed-a');
    const b = generateQualDraw(entries, { partnered: [], opposed: [] }, 'seed-b');
    expect(a.matches).not.toEqual(b.matches);
  });

  it('pairs 6 solos + 6 pairs without repeating partners when possible', () => {
    const entries: DrawEntry[] = [
      ...pairs(6),
      ...Array.from({ length: 6 }, (_, i) => ({ id: `s${i + 1}`, type: 'SOLO' as const, byeCount: 0 })),
    ];
    const first = generateQualDraw(entries, { partnered: [], opposed: [] }, 'mixed');
    const soloSides = first.sides.filter((side) => side.isTemporary && side.entryIds.length === 2);
    expect(soloSides).toHaveLength(3);
    const history = {
      partnered: soloSides.map((side) => [side.entryIds[0]!, side.entryIds[1]!] as [string, string]),
      opposed: [],
    };
    const second = generateQualDraw(entries, history, 'mixed-2');
    const repeats = second.sides.filter((side) => side.partnerRepeat).length;
    expect(repeats).toBe(0);
  });

  it('gives a bye when the number of sides is odd', () => {
    const preview = generateQualDraw(pairs(5), { partnered: [], opposed: [] }, 'odd');
    expect(preview.matches.some((match) => match.isBye)).toBe(true);
  });
});
