import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// Зеркало расчёта §8.10: 30 пар × 4000 = 120 000; фонд 84 000; 60/30/10.
function prizeFund(units) {
  const gross = units * 4000;
  const organizer = Math.floor(gross * 0.3);
  const fund = gross - organizer;
  const shares = [0.6, 0.3, 0.1];
  const perDivision = shares.map((share, i, all) => {
    if (i < all.length - 1) return Math.floor(fund * share);
    return fund - all.slice(0, -1).reduce((sum, s) => sum + Math.floor(fund * s), 0);
  });
  return { gross, organizer, fund, perDivision };
}

describe('prize fund example from §8.10', () => {
  it('matches 30-pair calculation', () => {
    const pf = prizeFund(30);
    assert.equal(pf.gross, 120000);
    assert.equal(pf.organizer, 36000);
    assert.equal(pf.fund, 84000);
    assert.deepEqual(pf.perDivision, [50400, 25200, 8400]);
  });
});
