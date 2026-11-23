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
  applyScoreWithSync,
  autoFillGames,
  autoFillOther,
  autoFillScore,
  freezeRoundScoring,
  isValidSetScore,
  matchComplete,
  neededGames,
  scoringSnapshot,
  scoreWheelMax,
  settingsForRound,
  tennisLabel,
  POINTS_PRESETS,
} from '../js/scoring.js';
import { computeStandings, sortStandings, standingMarks } from '../js/standings.js';
import {
  assertRoundKindAllowed,
  mustStartWithQualifying,
  qualificationTooLate,
} from '../js/qualification.js';
import { clearState, emptyStore, emptyTournament, loadState, saveState, STORAGE_KEY } from '../js/state.js';
import { autoCourts, compactMatchLine, compactSittingLine, rotateSitters } from '../js/pairs.js';
import { isTapGesture, nearestWheelValue } from '../js/wheel.js';
import { pointsTarget } from '../js/scoring.js';

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

test('points presets are 15, 17, 19, 21', () => {
  assert.deepEqual(POINTS_PRESETS, [15, 17, 19, 21]);
});

test('auto-fill: other = target − entered when win-by-2 is off', () => {
  assert.equal(autoFillOther(9, 15, false), 6);
  assert.equal(autoFillOther(15, 15, false), 0);
  assert.equal(autoFillOther(11, 15, true), null);
});

test('needed games: points mode is always one set', () => {
  assert.equal(neededGames({ scoringMode: 'points', gamesPerPairing: 2, decidingGame: true }, 'regular', []), 1);
});

test('needed games: set-to-N is one score row', () => {
  const settings = { scoringMode: 'games', setScore: true, gamesToWin: 6, decidingGame: true };
  assert.equal(neededGames(settings, 'regular', []), 1);
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

test('standing marks: medals and best woman, skip 🎉 without gender', () => {
  const mixed = standingMarks([
    { id: 'm1', name: 'Борис', gender: 'M' },
    { id: 'f1', name: 'Анна', gender: 'F' },
    { id: 'm2', name: 'Глеб', gender: 'M' },
    { id: 'f2', name: 'Вера', gender: 'F' },
  ]);
  assert.equal(mixed[0].medal, '🥇');
  assert.equal(mixed[1].medal, '🥈');
  assert.equal(mixed[2].medal, '🥉');
  assert.equal(mixed[3].medal, '');
  assert.equal(mixed[0].bestWoman, false);
  assert.equal(mixed[1].bestWoman, true);
  assert.equal(mixed[2].bestWoman, false);
  const topWoman = standingMarks([
    { id: 'f1', name: 'Анна', gender: 'F' },
    { id: 'm1', name: 'Борис', gender: 'M' },
    { id: 'm2', name: 'Глеб', gender: 'M' },
  ]);
  assert.equal(topWoman[0].medal, '🥇');
  assert.equal(topWoman[0].bestWoman, true);
  const noGender = standingMarks([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }]);
  assert.ok(noGender.every((m) => !m.bestWoman));
  assert.equal(noGender[0].medal, '🥇');
  const menOnly = standingMarks([
    { id: 'm1', name: 'Борис', gender: 'M' },
    { id: 'm2', name: 'Глеб', gender: 'M' },
  ]);
  assert.ok(menOnly.every((m) => !m.bestWoman));
});

test('qualification must be first when enabled, then hidden after a regular first round', () => {
  const settings = { qualifyingEnabled: true, courts: 2, pairType: 'any' };
  assert.equal(mustStartWithQualifying(settings, []), true);
  assert.throws(
    () => assertRoundKindAllowed(settings, [], 'regular'),
    /Сначала сыграйте квалификацию/,
  );
  assert.doesNotThrow(() => assertRoundKindAllowed(settings, [], 'qualifying'));
  const afterQual = [{ kind: 'qualifying', matches: [{ games: [{ a: 15, b: 10 }] }] }];
  assert.equal(mustStartWithQualifying(settings, afterQual), false);
  assert.doesNotThrow(() => assertRoundKindAllowed(settings, afterQual, 'regular'));
  assert.throws(() => assertRoundKindAllowed(settings, afterQual, 'qualifying'), /уже была/);
  const firstRegularDone = (round) =>
    round.matches.every((m) => (m.games || []).some((g) => g.a != null && g.b != null));
  const regularDone = [{ kind: 'regular', matches: [{ games: [{ a: 15, b: 10 }] }] }];
  assert.equal(qualificationTooLate(regularDone, firstRegularDone), true);
  assert.equal(mustStartWithQualifying(settings, regularDone), false);
  assert.throws(() => assertRoundKindAllowed(settings, regularDone, 'qualifying'), /только первым кругом/);
  const regularOpen = [{ kind: 'regular', matches: [{ games: [] }] }];
  assert.equal(qualificationTooLate(regularOpen, firstRegularDone), false);
  assert.throws(
    () =>
      generateRound({
        players: players8(),
        settings: { ...settings, pairLock: 'unlocked', tournamentFormat: 'free' },
        kind: 'regular',
        rng: mulberry32(1),
      }),
    /Сначала сыграйте квалификацию/,
  );
  const qualRound = generateRound({
    players: players8(),
    settings: { ...settings, pairLock: 'unlocked', tournamentFormat: 'free' },
    kind: 'qualifying',
    rng: mulberry32(1),
  });
  assert.equal(qualRound.matches.length, 2);
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
  const store = emptyStore();
  const tournament = emptyTournament();
  tournament.players = players8();
  store.tournaments.push(tournament);
  saveState(store, storage);
  assert.ok(storage.getItem(STORAGE_KEY));
  const loaded = loadState(storage);
  assert.equal(loaded.version, 2);
  assert.equal(loaded.tournaments[0].players.length, 8);
  const cleared = clearState(storage);
  assert.equal(cleared.tournaments.length, 0);
  assert.equal(storage.getItem(STORAGE_KEY), null);
});

test('auto courts: 8→2, 9→2, 12→3', () => {
  assert.equal(autoCourts(8), 2);
  assert.equal(autoCourts(9), 2);
  assert.equal(autoCourts(12), 3);
  assert.equal(autoCourts(4), 1);
  assert.equal(autoCourts(3), 0);
});

test('fair bye rotation for 9 players', () => {
  const ids = players8().map((p) => p.id).concat(['p9']);
  const sits = ids.map((_, i) => rotateSitters(ids, i).sitting[0]);
  assert.equal(new Set(sits).size, 9);
  for (let i = 0; i < 9; i += 1) {
    const { sitting, playing } = rotateSitters(ids, i);
    assert.equal(sitting.length, 1);
    assert.equal(playing.length, 8);
  }
});

test('total-points target 16/21/24/32', () => {
  assert.equal(pointsTarget({ scoringMode: 'total', totalPoints: 24 }, 'regular'), 24);
  assert.equal(pointsTarget({ scoringMode: 'total', totalPoints: 16 }, 'regular'), 16);
  assert.equal(pointsTarget({ scoringMode: 'total', totalPoints: 'custom', customTotal: 32 }, 'regular'), 32);
  assert.equal(autoFillOther(13, 21, false), 8);
});

test('compact match line for collapsed rounds', () => {
  const playersById = new Map([
    ['p1', { id: 'p1', name: 'Иван' }],
    ['p2', { id: 'p2', name: 'Маша' }],
    ['p3', { id: 'p3', name: 'Пётр' }],
    ['p4', { id: 'p4', name: 'Оля' }],
    ['p5', { id: 'p5', name: 'Кира' }],
  ]);
  const match = { court: 1, teamA: ['p1', 'p2'], teamB: ['p3', 'p4'] };
  assert.equal(compactMatchLine(match, playersById, '21:15'), 'Корт 1: Иван/Маша 21:15 Пётр/Оля');
  assert.equal(compactMatchLine(match, playersById, ''), 'Корт 1: Иван/Маша –:– Пётр/Оля');
  assert.equal(
    compactMatchLine({ ...match, sequence: 2 }, playersById, '15:7'),
    'Корт 1·2: Иван/Маша 15:7 Пётр/Оля',
  );
  assert.equal(compactSittingLine(['p5'], playersById), 'Сидят: Кира');
  assert.equal(compactSittingLine([], playersById), '');
});

test('tap vs scroll: small movement is a tap', () => {
  const start = { x: 10, y: 10, t: 1000, scrollTop: 0 };
  assert.equal(isTapGesture(start, { x: 12, y: 11, t: 1120, scrollTop: 0 }), true);
  assert.equal(isTapGesture(start, { x: 10, y: 40, t: 1180, scrollTop: 0 }), false);
  assert.equal(isTapGesture(start, { x: 10, y: 10, t: 1600, scrollTop: 0 }), false);
  assert.equal(isTapGesture(start, { x: 10, y: 10, t: 1100, scrollTop: 20 }), false);
});

test('auto-fill always re-syncs the opposite side', () => {
  const points = { scoringMode: 'points', pointsPreset: 15, winByTwo: false };
  const games = { scoringMode: 'games', setScore: true, gamesToWin: 6, decidingGame: true };
  const gamesNo = { scoringMode: 'games', setScore: true, gamesToWin: 6, decidingGame: false };
  const total = { scoringMode: 'total', totalPoints: 24 };
  assert.deepEqual(applyScoreWithSync({ a: 9, b: 6 }, 'a', 10, points, 'regular').b, 5);
  assert.deepEqual(applyScoreWithSync({ a: 10, b: 5 }, 'b', 7, points, 'regular').a, 8);
  assert.equal(applyScoreWithSync({ a: 9, b: 15 }, 'a', 10, total, 'regular').b, 14);
  assert.equal(applyScoreWithSync({ a: 4, b: 6 }, 'a', 5, games, 'regular').b, 6);
  assert.equal(applyScoreWithSync({ a: 6, b: 4 }, 'b', 3, games, 'regular').a, 6);
  assert.equal(applyScoreWithSync({ a: 4, b: 6 }, 'a', 6, games, 'regular').b, 6);
  assert.equal(applyScoreWithSync({ a: 6, b: 3 }, 'a', 6, gamesNo, 'regular').b, 4);
});

test('games auto-fill: under N → N, N with/without decider', () => {
  assert.equal(autoFillGames(4, 6, true), 6);
  assert.equal(autoFillGames(5, 6, true), 6);
  assert.equal(autoFillGames(6, 6, true), null);
  assert.equal(autoFillGames(6, 6, false), 4);
  assert.equal(autoFillGames(7, 7, true), null);
  assert.equal(autoFillGames(6, 7, true), 7);
  assert.equal(autoFillScore(4, { scoringMode: 'games', setScore: true, gamesToWin: 6, decidingGame: true }, 'regular'), 6);
  assert.equal(autoFillScore(9, { scoringMode: 'points', pointsPreset: 15, winByTwo: false }, 'regular'), 6);
});

test('valid set score: N:N-1 with decider, else N:N-2', () => {
  const sixDecider = { scoringMode: 'games', setScore: true, gamesToWin: 6, decidingGame: true };
  const sixNo = { scoringMode: 'games', setScore: true, gamesToWin: 6, decidingGame: false };
  const seven = { scoringMode: 'games', setScore: true, gamesToWin: 7, decidingGame: true };
  assert.equal(isValidSetScore(6, 4, sixDecider), true);
  assert.equal(isValidSetScore(6, 5, sixDecider), true);
  assert.equal(isValidSetScore(6, 6, sixDecider), false);
  assert.equal(isValidSetScore(7, 5, sixDecider), false);
  assert.equal(isValidSetScore(6, 5, sixNo), false);
  assert.equal(isValidSetScore(6, 4, sixNo), true);
  assert.equal(isValidSetScore(7, 6, seven), true);
  assert.equal(isValidSetScore(6, 4, seven), false);
  assert.equal(matchComplete({ kind: 'regular', games: [{ a: 6, b: 4 }] }, sixDecider, 'regular'), true);
  assert.equal(matchComplete({ kind: 'regular', games: [{ a: 6, b: 6 }] }, sixDecider, 'regular'), false);
});

test('freeze scoring on old rounds, new rounds use snapshot', () => {
  const rounds = [{ id: 'r1', kind: 'regular', matches: [] }];
  const settings = {
    scoringMode: 'points',
    pointsPreset: 15,
    winByTwo: false,
    gamesToWin: 6,
    decidingGame: true,
  };
  freezeRoundScoring(rounds, settings);
  assert.equal(rounds[0].scoring.scoringMode, 'points');
  assert.equal(rounds[0].scoring.setScore, false);
  settings.scoringMode = 'games';
  settings.setScore = true;
  assert.equal(settingsForRound(rounds[0], settings).scoringMode, 'points');
  const next = scoringSnapshot(settings, { forNewRound: true });
  assert.equal(next.scoringMode, 'games');
  assert.equal(next.setScore, true);
  assert.equal(next.gamesToWin, 6);
});

test('standings: games difference and mixed modes sum recorded numbers', () => {
  const players = players8().slice(0, 4);
  const rounds = [
    {
      kind: 'regular',
      scoring: { scoringMode: 'points', pointsPreset: 15, winByTwo: false },
      matches: [{ court: 1, teamA: ['p1', 'p2'], teamB: ['p3', 'p4'], games: [{ a: 15, b: 11 }] }],
    },
    {
      kind: 'regular',
      scoring: { scoringMode: 'games', setScore: true, gamesToWin: 6, decidingGame: true },
      matches: [{ court: 1, teamA: ['p1', 'p2'], teamB: ['p3', 'p4'], games: [{ a: 6, b: 4 }] }],
    },
  ];
  const rows = computeStandings(players, rounds, { scoringMode: 'games', setScore: true, gamesToWin: 6 });
  const anna = rows.find((r) => r.id === 'p1');
  assert.equal(anna.wins, 2);
  assert.equal(anna.pointsFor, 21);
  assert.equal(anna.pointsAgainst, 15);
  assert.equal(anna.delta, 6);
});

test('score wheel max is target or N, nearest snap', () => {
  assert.equal(scoreWheelMax({ scoringMode: 'points', pointsPreset: 15 }, 'regular'), 15);
  assert.equal(scoreWheelMax({ scoringMode: 'games', gamesToWin: 6 }, 'regular'), 6);
  assert.equal(scoreWheelMax({ scoringMode: 'total', totalPoints: 24 }, 'regular'), 24);
  const items = ['', 0, 1, 2, 3].map((n, i) => ({
    dataset: { n: n === '' ? '' : String(n) },
    offsetTop: 44 + i * 44,
    offsetHeight: 44,
  }));
  const el = {
    scrollTop: 0,
    clientHeight: 132,
    querySelectorAll: () => items,
  };
  assert.equal(nearestWheelValue(el), null);
  el.scrollTop = 44 * 3;
  assert.equal(nearestWheelValue(el), 2);
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
