import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  formPairs,
  lastOpponentKeys,
  rankingMixedBalanced,
  roundRobinMatchups,
  strengthMatchups,
  teamMatchFactors,
  nextFreeRound,
  opponentKey,
} from '../js/fixed.js';
import { generateRound, partnerKey } from '../js/pairing.js';
import { mulberry32 } from '../js/rng.js';
import { rankPlayers } from '../js/standings.js';
import { loadState, STORAGE_KEY } from '../js/state.js';

function nPlayers(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Игрок ${i + 1}`,
    gender: i % 2 === 0 ? 'F' : 'M',
  }));
}

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

test('4-pair factors are the three round-robin slots', () => {
  const factors = teamMatchFactors(4);
  assert.equal(factors.length, 3);
  for (const edges of factors) {
    assert.equal(edges.length, 2);
    const ids = edges.flat().sort();
    assert.deepEqual(ids, [0, 1, 2, 3]);
  }
});

test('6-pair round-robin: each pair meets every other once', () => {
  const pairs = nPlayers(12).reduce((acc, p, i, arr) => {
    if (i % 2 === 0) acc.push([arr[i].id, arr[i + 1].id]);
    return acc;
  }, []);
  assert.equal(pairs.length, 6);
  const seen = new Set();
  for (let slot = 0; slot < 5; slot += 1) {
    const { matches } = roundRobinMatchups(pairs, slot);
    assert.equal(matches.length, 3);
    for (const m of matches) {
      const k = opponentKey(m.teamA, m.teamB);
      assert.equal(seen.has(k), false, k);
      seen.add(k);
    }
  }
  assert.equal(seen.size, 15);
});

test('strength matchups: 1st vs 2nd, 3rd vs 4th', () => {
  const pairs = [
    ['p1', 'p2'],
    ['p3', 'p4'],
    ['p5', 'p6'],
    ['p7', 'p8'],
  ];
  const standings = [
    { id: 'p1', pointsFor: 40, wins: 4, delta: 10 },
    { id: 'p2', pointsFor: 40, wins: 4, delta: 10 },
    { id: 'p3', pointsFor: 30, wins: 3, delta: 5 },
    { id: 'p4', pointsFor: 30, wins: 3, delta: 5 },
    { id: 'p5', pointsFor: 20, wins: 2, delta: 0 },
    { id: 'p6', pointsFor: 20, wins: 2, delta: 0 },
    { id: 'p7', pointsFor: 10, wins: 1, delta: -5 },
    { id: 'p8', pointsFor: 10, wins: 1, delta: -5 },
  ];
  const { matches } = strengthMatchups(pairs, standings, { standingsSort: 'points' }, new Set());
  const c1 = matches.find((m) => m.court === 1);
  const c1ids = [...c1.teamA, ...c1.teamB].sort();
  assert.deepEqual(c1ids, ['p1', 'p2', 'p3', 'p4']);
  const c2ids = [...matches.find((m) => m.court === 2).teamA, ...matches.find((m) => m.court === 2).teamB].sort();
  assert.deepEqual(c2ids, ['p5', 'p6', 'p7', 'p8']);
});

test('strength matchups avoid repeating last opponents', () => {
  const pairs = [
    ['a', 'b'],
    ['c', 'd'],
    ['e', 'f'],
    ['g', 'h'],
  ];
  const standings = [];
  const first = strengthMatchups(pairs, standings, { standingsSort: 'points' }, new Set());
  const lastOpp = lastOpponentKeys({ matches: first.matches });
  const second = strengthMatchups(pairs, standings, { standingsSort: 'points' }, lastOpp);
  const firstKeys = [...lastOpp].sort();
  const secondKeys = [...lastOpponentKeys({ matches: second.matches })].sort();
  assert.notDeepEqual(secondKeys, firstKeys);
});

test('ranking mixed: best man with worst woman', () => {
  const ranked = [
    { id: 'm1', gender: 'M', name: 'M1' },
    { id: 'w1', gender: 'F', name: 'W1' },
    { id: 'm2', gender: 'M', name: 'M2' },
    { id: 'w2', gender: 'F', name: 'W2' },
    { id: 'm3', gender: 'M', name: 'M3' },
    { id: 'w3', gender: 'F', name: 'W3' },
    { id: 'm4', gender: 'M', name: 'M4' },
    { id: 'w4', gender: 'F', name: 'W4' },
  ];
  const pairs = rankingMixedBalanced(ranked);
  assert.equal(pairs[0][0].id, 'm1');
  assert.equal(pairs[0][1].id, 'w4');
  assert.equal(pairs[3][0].id, 'm4');
  assert.equal(pairs[3][1].id, 'w1');
  for (const [a, b] of pairs) assert.notEqual(a.gender, b.gender);
});

test('locked free keeps the same partners next round', () => {
  const players = nPlayers(8);
  const settings = { courts: 2, pairType: 'any', pairLock: 'locked', tournamentFormat: 'free', standingsSort: 'points' };
  const first = generateRound({
    players,
    settings,
    standings: [],
    rounds: [],
    kind: 'regular',
    rng: mulberry32(1),
  });
  const second = generateRound({
    players,
    settings,
    standings: players.map((p, i) => ({ id: p.id, pointsFor: 20 - i, wins: 1, delta: 5 - i })),
    rounds: [{ kind: 'regular', format: 'free', matches: first.matches, fixedPairs: first.fixedPairs }],
    kind: 'regular',
    fixedPairs: first.fixedPairs,
    rng: mulberry32(2),
  });
  const partners = (round) =>
    round.matches.flatMap((m) => [partnerKey(m.teamA[0], m.teamA[1]), partnerKey(m.teamB[0], m.teamB[1])]).sort();
  assert.deepEqual(partners(second), partners(first));
});

test('unlocked free re-forms 1+last each round', () => {
  const players = nPlayers(8);
  const settings = { courts: 2, pairType: 'any', pairLock: 'unlocked', tournamentFormat: 'free', standingsSort: 'points' };
  const standings = players.map((p, i) => ({
    id: p.id,
    pointsFor: 80 - i * 10,
    wins: 8 - i,
    delta: 40 - i,
  }));
  const ranked = rankPlayers(players, standings, 'points');
  const result = nextFreeRound({
    players,
    settings,
    standings,
    rounds: [{ kind: 'regular', matches: [] }],
    rng: mulberry32(3),
  });
  const keys = result.matches.flatMap((m) => [partnerKey(m.teamA[0], m.teamA[1]), partnerKey(m.teamB[0], m.teamB[1])]);
  const expected = [
    partnerKey(ranked[0].id, ranked[7].id),
    partnerKey(ranked[1].id, ranked[6].id),
    partnerKey(ranked[2].id, ranked[5].id),
    partnerKey(ranked[3].id, ranked[4].id),
  ];
  assert.deepEqual(keys.sort(), expected.sort());
});

test('formPairs ranking-mixed needs equal genders', () => {
  const players = nPlayers(8).map((p, i) => ({ ...p, gender: i < 6 ? 'M' : 'F' }));
  assert.throws(() =>
    formPairs({
      method: 'ranking-mixed',
      players,
      standings: [],
      rounds: [],
      settings: { pairType: 'any', standingsSort: 'points' },
      rng: mulberry32(1),
    }),
  );
});

test('migrate adds pairLock and skips wizard if rounds exist', () => {
  const storage = memoryStorage();
  storage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: 1,
      players: nPlayers(8),
      settings: { courts: 2, scoringMode: 'points' },
      rounds: [{ kind: 'regular', matches: [] }],
      nextPlayerNum: 9,
      nextRoundNum: 2,
    }),
  );
  const loaded = loadState(storage);
  assert.equal(loaded.settings.pairLock, 'locked');
  assert.equal(loaded.settings.standingsSort, 'points');
  assert.equal(loaded.settings.setupDone, true);
  assert.equal(loaded.settings.lockedMatchups, 'strength');
});
