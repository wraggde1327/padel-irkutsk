import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  americanoMixedSchedule,
  americanoSchedule,
  escaleraMove,
  kingMove,
  mexicanoMatches,
  nextFormatRound,
  pairEscaleraCycleComplete,
} from '../js/formats.js';
import { generateRound, partnerKey } from '../js/pairing.js';
import { opponentKey } from '../js/fixed.js';
import { mulberry32 } from '../js/rng.js';
import { loadState, saveState, STORAGE_KEY } from '../js/state.js';

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

function partnerSetFromSchedule(schedule) {
  const map = new Map();
  for (const round of schedule) {
    for (const match of round.matches) {
      for (const team of [match.teamA, match.teamB]) {
        const k = partnerKey(team[0], team[1]);
        map.set(k, (map.get(k) || 0) + 1);
        for (const id of team) {
          if (!map.has(`p:${id}`)) map.set(`p:${id}`, new Set());
          const other = team[0] === id ? team[1] : team[0];
          map.get(`p:${id}`).add(other);
        }
      }
    }
  }
  return map;
}

test('americano 8: each partners with every other once', () => {
  const ids = nPlayers(8).map((p) => p.id);
  const schedule = americanoSchedule(ids);
  assert.equal(schedule.length, 7);
  const map = partnerSetFromSchedule(schedule);
  for (const id of ids) {
    assert.equal(map.get(`p:${id}`).size, 7, id);
  }
  for (const [k, n] of map) {
    if (!String(k).startsWith('p:')) assert.equal(n, 1, k);
  }
});

test('americano 12: unique partners across 11 rounds', () => {
  const ids = nPlayers(12).map((p) => p.id);
  const schedule = americanoSchedule(ids);
  assert.equal(schedule.length, 11);
  assert.equal(schedule[0].matches.length, 3);
  const map = partnerSetFromSchedule(schedule);
  for (const id of ids) {
    assert.equal(map.get(`p:${id}`).size, 11, id);
  }
});

test('americano 9: one rotating bye each round', () => {
  const ids = nPlayers(9).map((p) => p.id);
  const schedule = americanoSchedule(ids);
  assert.equal(schedule.length, 9);
  const sit = Object.fromEntries(ids.map((id) => [id, 0]));
  for (const round of schedule) {
    assert.equal(round.sitting.length, 1);
    assert.equal(round.matches.length, 2);
    sit[round.sitting[0]] += 1;
  }
  for (const id of ids) assert.equal(sit[id], 1, id);
});

test('americano generateRound stays unique if standings change', () => {
  const players = nPlayers(8);
  const settings = {
    courts: 2,
    pairType: 'any',
    tournamentFormat: 'americano',
    gamesPerPairing: 1,
    decidingGame: false,
  };
  const rounds = [];
  const seen = new Set();
  for (let i = 0; i < 7; i += 1) {
    const standings = players.map((p, idx) => ({
      id: p.id,
      pointsFor: (i + 1) * (idx + 1),
      delta: idx - i,
      wins: i,
    }));
    const result = generateRound({
      players,
      settings,
      standings,
      rounds,
      kind: 'regular',
      rng: mulberry32(1),
    });
    rounds.push({
      kind: 'regular',
      format: 'americano',
      matches: result.matches,
      playerOrder: result.playerOrder,
      override: false,
    });
    for (const match of result.matches) {
      for (const team of [match.teamA, match.teamB]) {
        const k = partnerKey(team[0], team[1]);
        assert.equal(seen.has(k), false, `repeat ${k} round ${i}`);
        seen.add(k);
      }
    }
  }
  assert.equal(seen.size, 28);
});

test('americano mixed 8: all pairs M+F', () => {
  const players = nPlayers(8);
  const schedule = americanoMixedSchedule(players);
  assert.equal(schedule.length, 4);
  const byId = new Map(players.map((p) => [p.id, p]));
  for (const round of schedule) {
    for (const match of round.matches) {
      for (const team of [match.teamA, match.teamB]) {
        assert.notEqual(byId.get(team[0]).gender, byId.get(team[1]).gender);
      }
    }
  }
});

test('mexicano groups top 4 on court 1 with 1-4, 2-3', () => {
  const players = nPlayers(8);
  const standings = players.map((p, i) => ({
    id: p.id,
    pointsFor: 80 - i * 5,
    delta: 40 - i * 4,
    wins: 8 - i,
  }));
  const { matches } = mexicanoMatches({
    players,
    settings: { courts: 2, pairType: 'any', mexicanoPairing: '1-4', tournamentFormat: 'mexicano' },
    standings,
    rounds: [{ kind: 'regular', matches: [{ teamA: ['p1', 'p2'], teamB: ['p3', 'p4'], games: [{ a: 1, b: 0 }] }] }],
    rng: mulberry32(1),
  });
  assert.equal(matches.length, 2);
  const c1 = matches.find((m) => m.court === 1);
  const ids = [...c1.teamA, ...c1.teamB].sort();
  assert.deepEqual(ids, ['p1', 'p2', 'p3', 'p4']);
  const partners = [partnerKey(c1.teamA[0], c1.teamA[1]), partnerKey(c1.teamB[0], c1.teamB[1])].sort();
  assert.deepEqual(partners, ['p1:p4', 'p2:p3'].sort());
});

test('mexicano 1-3, 2-4', () => {
  const players = nPlayers(8);
  const standings = players.map((p, i) => ({
    id: p.id,
    pointsFor: 80 - i,
    delta: 40 - i,
    wins: 5,
  }));
  const { matches } = mexicanoMatches({
    players,
    settings: { courts: 2, pairType: 'any', mexicanoPairing: '1-3', tournamentFormat: 'mexicano' },
    standings,
    rounds: [{ kind: 'regular', matches: [] }],
    rng: mulberry32(1),
  });
  const c1 = matches.find((m) => m.court === 1);
  const partners = [partnerKey(c1.teamA[0], c1.teamA[1]), partnerKey(c1.teamB[0], c1.teamB[1])].sort();
  assert.deepEqual(partners, ['p1:p3', 'p2:p4'].sort());
});

test('escalera 2 courts: top 2 up, bottom 2 down', () => {
  const groups = [
    ['a', 'b', 'c', 'd'],
    ['e', 'f', 'g', 'h'],
  ];
  const matches = [
    { court: 1, teamA: ['a', 'b'], teamB: ['c', 'd'], games: [{ a: 15, b: 5 }] },
    { court: 1, teamA: ['a', 'c'], teamB: ['b', 'd'], games: [{ a: 15, b: 7 }] },
    { court: 1, teamA: ['a', 'd'], teamB: ['b', 'c'], games: [{ a: 15, b: 8 }] },
    { court: 2, teamA: ['e', 'f'], teamB: ['g', 'h'], games: [{ a: 15, b: 4 }] },
    { court: 2, teamA: ['e', 'g'], teamB: ['f', 'h'], games: [{ a: 15, b: 6 }] },
    { court: 2, teamA: ['e', 'h'], teamB: ['f', 'g'], games: [{ a: 15, b: 9 }] },
  ];
  const { groups: next } = escaleraMove(matches, { gamesPerPairing: 1, decidingGame: false }, 'regular', groups);
  assert.deepEqual(next[0].sort(), ['a', 'b', 'e', 'f']);
  assert.deepEqual(next[1].sort(), ['c', 'd', 'g', 'h']);
});

test('escalera 3 courts movement', () => {
  const groups = [
    ['a1', 'a2', 'a3', 'a4'],
    ['b1', 'b2', 'b3', 'b4'],
    ['c1', 'c2', 'c3', 'c4'],
  ];
  function sweep(court, ids, topHeavy) {
    const [w1, w2, l1, l2] = ids;
    const hi = topHeavy ? 15 : 11;
    const lo = topHeavy ? 5 : 9;
    return [
      { court, teamA: [w1, w2], teamB: [l1, l2], games: [{ a: hi, b: lo }] },
      { court, teamA: [w1, l1], teamB: [w2, l2], games: [{ a: hi, b: lo }] },
      { court, teamA: [w1, l2], teamB: [w2, l1], games: [{ a: hi, b: lo }] },
    ];
  }
  const matches = [
    ...sweep(1, groups[0], true),
    ...sweep(2, groups[1], true),
    ...sweep(3, groups[2], true),
  ];
  const { groups: next } = escaleraMove(matches, { gamesPerPairing: 1, decidingGame: false }, 'regular', groups);
  assert.equal(next[0].length, 4);
  assert.equal(next[1].length, 4);
  assert.equal(next[2].length, 4);
  assert.ok(next[0].includes('a1') && next[0].includes('b1'));
  assert.ok(next[2].includes('c3') || next[2].includes('c4'));
});

test('king: best winner up, worst loser down, top/bottom keep', () => {
  const players = [
    { id: 'a1', name: 'A1', gender: 'M' },
    { id: 'a2', name: 'A2', gender: 'M' },
    { id: 'b1', name: 'B1', gender: 'F' },
    { id: 'b2', name: 'B2', gender: 'F' },
    { id: 'c1', name: 'C1', gender: 'M' },
    { id: 'c2', name: 'C2', gender: 'M' },
    { id: 'd1', name: 'D1', gender: 'F' },
    { id: 'd2', name: 'D2', gender: 'F' },
  ];
  const standings = [
    { id: 'a1', delta: 10, wins: 2, pointsFor: 20 },
    { id: 'a2', delta: 3, wins: 2, pointsFor: 20 },
    { id: 'b1', delta: 0, wins: 0, pointsFor: 5 },
    { id: 'b2', delta: -10, wins: 0, pointsFor: 5 },
    { id: 'c1', delta: 20, wins: 3, pointsFor: 30 },
    { id: 'c2', delta: 5, wins: 3, pointsFor: 30 },
    { id: 'd1', delta: -2, wins: 0, pointsFor: 8 },
    { id: 'd2', delta: -8, wins: 0, pointsFor: 8 },
  ];
  const matches = [
    { court: 1, teamA: ['a1', 'a2'], teamB: ['b1', 'b2'], games: [{ a: 15, b: 5 }] },
    { court: 2, teamA: ['c1', 'c2'], teamB: ['d1', 'd2'], games: [{ a: 15, b: 8 }] },
  ];
  const { groups } = kingMove(matches, { gamesPerPairing: 1, decidingGame: false }, 'regular', standings, players);
  assert.deepEqual(groups[0].sort(), ['a1', 'a2', 'b1', 'c1']);
  assert.deepEqual(groups[1].sort(), ['b2', 'c2', 'd1', 'd2']);
});

test('king 3 courts: each group stays at 4', () => {
  const players = nPlayers(12);
  const standings = players.map((p, i) => ({
    id: p.id,
    delta: 20 - i,
    wins: 5,
    pointsFor: 50 - i,
  }));
  const matches = [1, 2, 3].map((court) => ({
    court,
    teamA: [`p${(court - 1) * 4 + 1}`, `p${(court - 1) * 4 + 2}`],
    teamB: [`p${(court - 1) * 4 + 3}`, `p${(court - 1) * 4 + 4}`],
    games: [{ a: 15, b: 9 }],
  }));
  const { groups } = kingMove(matches, { gamesPerPairing: 1, decidingGame: false }, 'regular', standings, players);
  assert.equal(groups.length, 3);
  for (const g of groups) assert.equal(g.length, 4);
  const all = groups.flat();
  assert.equal(new Set(all).size, 12);
  assert.deepEqual(groups[0].sort(), ['p1', 'p2', 'p3', 'p5']);
  assert.deepEqual(groups[1].sort(), ['p4', 'p6', 'p7', 'p9']);
  assert.deepEqual(groups[2].sort(), ['p10', 'p11', 'p12', 'p8']);
});

test('escalera round has three pairings per court', () => {
  const players = nPlayers(8);
  const result = generateRound({
    players,
    settings: { courts: 2, pairType: 'any', tournamentFormat: 'escalera' },
    standings: [],
    rounds: [],
    kind: 'regular',
    rng: mulberry32(2),
  });
  assert.equal(result.matches.length, 6);
  assert.equal(result.matches.filter((m) => m.court === 1).length, 3);
  assert.equal(result.courtGroups.length, 2);
  const seq = result.matches.filter((m) => m.court === 1).map((m) => m.sequence);
  assert.deepEqual(seq, [1, 2, 3]);
});

test('pair-escalera needs exactly 8 players', () => {
  assert.throws(
    () =>
      generateRound({
        players: nPlayers(7),
        settings: { tournamentFormat: 'pair-escalera', pairType: 'any' },
        kind: 'regular',
        rng: mulberry32(1),
      }),
    /ровно 8/,
  );
});

test('pair-escalera pairs 1-8 and plays a 3-round pair round-robin', () => {
  const players = Array.from({ length: 8 }, (_, i) => ({
    id: `p${i + 1}`,
    name: `A${i + 1}`,
    gender: 'M',
  }));
  const settings = { courts: 2, pairType: 'any', tournamentFormat: 'pair-escalera' };
  const rounds = [];
  let fixedPairs;
  const seenOpp = new Set();
  const partnerFirst = [];
  for (let slot = 0; slot < 3; slot += 1) {
    const result = generateRound({
      players,
      settings,
      standings: [],
      rounds,
      kind: 'regular',
      fixedPairs,
      rng: mulberry32(slot + 1),
    });
    assert.equal(result.format, 'pair-escalera');
    assert.equal(result.cycleSlot, slot);
    assert.equal(result.matches.length, 2);
    assert.equal(pairEscaleraCycleComplete(result), slot >= 2);
    const partners = result.matches.flatMap((m) => [
      partnerKey(m.teamA[0], m.teamA[1]),
      partnerKey(m.teamB[0], m.teamB[1]),
    ]);
    if (slot === 0) {
      assert.deepEqual(partners.sort(), ['p1:p8', 'p2:p7', 'p3:p6', 'p4:p5'].sort());
      partnerFirst.push(...partners);
    } else {
      assert.deepEqual(partners.sort(), partnerFirst.slice().sort());
    }
    for (const m of result.matches) {
      const k = opponentKey(m.teamA, m.teamB);
      assert.equal(seenOpp.has(k), false, k);
      seenOpp.add(k);
    }
    rounds.push({
      kind: 'regular',
      format: 'pair-escalera',
      matches: result.matches,
      fixedPairs: result.fixedPairs,
      cycleSlot: result.cycleSlot,
    });
    fixedPairs = result.fixedPairs;
  }
  assert.equal(seenOpp.size, 6);
  assert.equal(pairEscaleraCycleComplete(rounds.at(-1)), true);

  const standings = players.map((p) => ({
    id: p.id,
    pointsFor: p.id === 'p3' ? 100 : 0,
    wins: p.id === 'p3' ? 3 : 0,
    delta: p.id === 'p3' ? 40 : 0,
  }));
  const next = generateRound({
    players,
    settings,
    standings,
    rounds,
    kind: 'regular',
    fixedPairs,
    rng: mulberry32(9),
  });
  assert.equal(next.cycleSlot, 0);
  const nextPartners = next.matches
    .flatMap((m) => [partnerKey(m.teamA[0], m.teamA[1]), partnerKey(m.teamB[0], m.teamB[1])])
    .sort();
  assert.deepEqual(nextPartners, ['p3:p8', 'p1:p7', 'p2:p6', 'p4:p5'].sort());
});

test('generateRound dispatches mexicano for 12 players', () => {
  const players = nPlayers(12);
  const { matches } = generateRound({
    players,
    settings: { courts: 3, pairType: 'any', tournamentFormat: 'mexicano', mexicanoPairing: '1-4' },
    standings: players.map((p, i) => ({ id: p.id, delta: 12 - i, wins: 1, pointsFor: 20 })),
    rounds: [{ kind: 'regular', matches: [] }],
    kind: 'regular',
    rng: mulberry32(3),
  });
  assert.equal(matches.length, 3);
});

test('nextFormatRound king after empty history still 8 players / 2 courts', () => {
  const players = nPlayers(8);
  const result = nextFormatRound({
    players,
    settings: { courts: 2, pairType: 'any', tournamentFormat: 'king' },
    standings: [],
    rounds: [],
    rng: mulberry32(9),
  });
  assert.equal(result.matches.length, 2);
  const ids = result.matches.flatMap((m) => [...m.teamA, ...m.teamB]);
  assert.equal(new Set(ids).size, 8);
});

test('migrate kingOfTheCourt true → format king', () => {
  const storage = memoryStorage();
  storage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: 1,
      players: [],
      settings: { kingOfTheCourt: true, courts: 2 },
      rounds: [],
      nextPlayerNum: 1,
      nextRoundNum: 1,
      ui: {},
    }),
  );
  const loaded = loadState(storage);
  assert.equal(loaded.version, 2);
  assert.equal(loaded.tournaments.length, 1);
  assert.equal(loaded.tournaments[0].settings.tournamentFormat, 'king');
  assert.equal(loaded.tournaments[0].settings.mexicanoPairing, '1-4');
});

test('migrate free keeps saved players', () => {
  const storage = memoryStorage();
  const players = nPlayers(8);
  saveState(
    {
      version: 1,
      players,
      settings: { scoringMode: 'points', pointsPreset: 11, courts: 2 },
      rounds: [],
      nextPlayerNum: 9,
      nextRoundNum: 1,
      ui: { tab: 'play' },
    },
    storage,
  );
  const loaded = loadState(storage);
  assert.equal(loaded.tournaments[0].players.length, 8);
  assert.equal(loaded.tournaments[0].settings.tournamentFormat, 'free');
  assert.equal(loaded.tournaments[0].settings.pointsPreset, 'custom');
  assert.equal(loaded.tournaments[0].settings.customPoints, 11);
});

test('generateRound 9 players: 2 courts and one bye', () => {
  const players = nPlayers(9);
  const result = generateRound({
    players,
    settings: { tournamentFormat: 'mexicano', pairType: 'any', mexicanoPairing: '1-4' },
    standings: [],
    rounds: [],
    kind: 'regular',
    rng: mulberry32(4),
  });
  assert.equal(result.matches.length, 2);
  assert.equal(result.sitting.length, 1);
  const playing = result.matches.flatMap((m) => [...m.teamA, ...m.teamB]);
  assert.equal(new Set(playing).size, 8);
  assert.equal(playing.includes(result.sitting[0]), false);
});
