import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  generateRound,
  kingOfTheCourtGroups,
  partnerCounts,
  partnerKey,
  rankingPartnerPairs,
} from '../js/pairing.js';
import { mulberry32 } from '../js/rng.js';
import {
  applyTennisPoint,
  autoFillOther,
  neededGames,
  tennisLabel,
} from '../js/scoring.js';
import { computeStandings, sortStandings } from '../js/standings.js';
import { clearState, emptyState, loadState, saveState, STORAGE_KEY } from '../js/state.js';

function players8() {
  const names = ['Анна', 'Борис', 'Вера', 'Глеб', 'Даша', 'Егор', 'Женя', 'Илья'];
  return names.map((name, i) => ({
    id: `p${i + 1}`,
    name,
    gender: i % 2 === 0 ? 'F' : 'M',
  }));
}

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      map.set(k, String(v));
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

test('auto-fill: other = target − entered when win-by-2 is off', () => {
  assert.equal(autoFillOther(9, 15, false), 6);
  assert.equal(autoFillOther(15, 15, false), 0);
  assert.equal(autoFillOther(11, 15, true), null);
});

test('needed games: points mode is always one set', () => {
  assert.equal(neededGames({ scoringMode: 'points', gamesPerPairing: 2, decidingGame: true }, 'regular', []), 1);
});

test('needed games: two plus decider at a tie', () => {
  const settings = { scoringMode: 'games', gamesPerPairing: 2, decidingGame: true };
  assert.equal(neededGames(settings, 'regular', []), 2);
  assert.equal(
    neededGames(settings, 'regular', [
      { a: null, b: null },
      { a: null, b: null },
    ]),
    2,
  );
  assert.equal(
    neededGames(settings, 'regular', [
      { a: 15, b: 11 },
      { a: 10, b: 15 },
    ]),
    3,
  );
  assert.equal(
    neededGames(settings, 'regular', [
      { a: 15, b: 11 },
      { a: 15, b: 8 },
    ]),
    2,
  );
  assert.equal(neededGames(settings, 'qualifying', [{ a: 15, b: 11 }]), 1);
});

test('tennis golden point at 40-40', () => {
  const deuce = { a: 3, b: 4, tennis: { ptsA: 3, ptsB: 3 } };
  const labels = tennisLabel(3, 3);
  assert.equal(labels.golden, true);
  const won = applyTennisPoint(deuce, 'a');
  assert.equal(won.a, 4);
  assert.equal(won.b, 4);
  assert.deepEqual(won.tennis, { ptsA: 0, ptsB: 0 });
});

test('ranking pairs 1+8, 2+7, 3+6, 4+5', () => {
  const ranked = players8();
  const pairs = rankingPartnerPairs(ranked, false);
  assert.deepEqual(
    pairs.map((pair) => pair.map((p) => p.id)),
    [
      ['p1', 'p8'],
      ['p2', 'p7'],
      ['p3', 'p6'],
      ['p4', 'p5'],
    ],
  );
});

test('mixed ranking uses opposite gender as last partner', () => {
  const ranked = players8();
  const pairs = rankingPartnerPairs(ranked, true);
  for (const [a, b] of pairs) {
    assert.notEqual(a.gender, b.gender);
  }
});

test('qualifying is reproducible with a seed and uses all eight players', () => {
  const settings = {
    courts: 2,
    pairType: 'any',
    pairMethod: 'random',
    kingOfTheCourt: false,
  };
  const a = generateRound({
    players: players8(),
    settings,
    kind: 'qualifying',
    rng: mulberry32(42),
  });
  const b = generateRound({
    players: players8(),
    settings,
    kind: 'qualifying',
    rng: mulberry32(42),
  });
  assert.deepEqual(a.matches, b.matches);
  const ids = a.matches.flatMap((m) => [...m.teamA, ...m.teamB]);
  assert.equal(new Set(ids).size, 8);
});

test('random mix prefers unused partners', () => {
  const players = players8();
  const settings = {
    courts: 2,
    pairType: 'any',
    pairMethod: 'random',
    kingOfTheCourt: false,
  };
  const first = generateRound({
    players,
    settings,
    kind: 'regular',
    method: 'random',
    rng: mulberry32(7),
  });
  const second = generateRound({
    players,
    settings,
    standings: [],
    rounds: [{ kind: 'regular', matches: first.matches }],
    kind: 'regular',
    method: 'random',
    rng: mulberry32(8),
  });
  const before = partnerCounts([{ matches: first.matches }]);
  let repeats = 0;
  for (const match of second.matches) {
    repeats += before.get(partnerKey(match.teamA[0], match.teamA[1])) || 0;
    repeats += before.get(partnerKey(match.teamB[0], match.teamB[1])) || 0;
  }
  assert.ok(repeats <= 2);
});

test('king of the court: winners up, losers down', () => {
  const matches = [
    {
      court: 1,
      teamA: ['a1', 'a2'],
      teamB: ['b1', 'b2'],
      games: [{ a: 15, b: 10 }],
    },
    {
      court: 2,
      teamA: ['c1', 'c2'],
      teamB: ['d1', 'd2'],
      games: [{ a: 8, b: 15 }],
    },
  ];
  const groups = kingOfTheCourtGroups(matches, { gamesPerPairing: 1, decidingGame: false }, 'regular');
  assert.deepEqual(groups[0].sort(), ['a1', 'a2', 'd1', 'd2']);
  assert.deepEqual(groups[1].sort(), ['b1', 'b2', 'c1', 'c2']);
});

test('standings accumulate wins and point delta, sort switches', () => {
  const players = players8();
  const rounds = [
    {
      kind: 'qualifying',
      matches: [
        {
          court: 1,
          teamA: ['p1', 'p2'],
          teamB: ['p3', 'p4'],
          games: [{ a: 15, b: 11 }],
        },
        {
          court: 2,
          teamA: ['p5', 'p6'],
          teamB: ['p7', 'p8'],
          games: [{ a: 9, b: 15 }],
        },
      ],
    },
  ];
  const rows = computeStandings(players, rounds, { gamesPerPairing: 1, decidingGame: false });
  const anna = rows.find((r) => r.id === 'p1');
  assert.equal(anna.wins, 1);
  assert.equal(anna.pointsFor, 15);
  assert.equal(anna.pointsAgainst, 11);
  assert.equal(anna.delta, 4);
  const byWins = sortStandings(rows, 'wins');
  assert.equal(byWins[0].wins, 1);
  const byDelta = sortStandings(rows, 'delta');
  assert.ok(byDelta[0].delta >= byDelta[1].delta);
});

test('localStorage round-trip and reset', () => {
  const storage = memoryStorage();
  const state = emptyState();
  state.players = players8();
  saveState(state, storage);
  assert.ok(storage.getItem(STORAGE_KEY));
  const loaded = loadState(storage);
  assert.equal(loaded.players.length, 8);
  const cleared = clearState(storage);
  assert.equal(cleared.players.length, 0);
  assert.equal(storage.getItem(STORAGE_KEY), null);
});

test('12 players / 3 courts layout', () => {
  const players = Array.from({ length: 12 }, (_, i) => ({
    id: `x${i + 1}`,
    name: `Игрок ${i + 1}`,
    gender: i < 6 ? 'M' : 'F',
  }));
  const { matches } = generateRound({
    players,
    settings: { courts: 3, pairType: 'any', pairLock: 'unlocked', tournamentFormat: 'free' },
    kind: 'regular',
    rng: mulberry32(1),
  });
  assert.equal(matches.length, 3);
  assert.deepEqual(
    matches.map((m) => m.court),
    [1, 2, 3],
  );
});
