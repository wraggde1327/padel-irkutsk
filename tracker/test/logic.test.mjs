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
  autoFillGamesTotal,
  autoFillOther,
  autoFillScore,
  clampScoreValue,
  freezeRoundScoring,
  GAMES_TOTAL_PRESETS,
  isValidGamesTotalScore,
  isValidSetScore,
  matchComplete,
  neededGames,
  scoringSnapshot,
  scoreTotalDeciding,
  scoreTotalLimit,
  scoreWheelMax,
  settingsForRound,
  tennisLabel,
  POINTS_PRESETS,
  usesGamesTotal,
  usesScoreTotal,
} from '../js/scoring.js';
import { computeStandings, sortStandings, standingMarks, standingPlace } from '../js/standings.js';
import { scoringSummary } from '../js/render.js';
import {
  assertRoundKindAllowed,
  mustStartWithQualifying,
  qualificationTooLate,
} from '../js/qualification.js';
import {
  clearState,
  defaultSettingsFor,
  emptyStore,
  emptyTournament,
  loadState,
  saveState,
  STORAGE_KEY,
} from '../js/state.js';
import { autoCourts, compactMatchLine, compactSittingLine, rotateSitters } from '../js/pairs.js';
import {
  isTapGesture,
  nearestWheelValue,
  snapOffset,
  wheelValues,
  wrapIndex,
  wrapLoopScrollTop,
  WHEEL_ITEM_PX,
} from '../js/wheel.js';
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

test('pair-escalera mixed skips same-gender from the bottom', () => {
  const ranked = [
    { id: '1', name: '1', gender: 'M' },
    { id: '2', name: '2', gender: 'M' },
    { id: '3', name: '3', gender: 'F' },
    { id: '4', name: '4', gender: 'F' },
    { id: '5', name: '5', gender: 'F' },
    { id: '6', name: '6', gender: 'F' },
    { id: '7', name: '7', gender: 'M' },
    { id: '8', name: '8', gender: 'M' },
  ];
  const pairs = rankingPartnerPairs(ranked, true);
  assert.deepEqual(
    pairs.map((pair) => pair.map((p) => p.id)),
    [
      ['1', '6'],
      ['2', '5'],
      ['3', '8'],
      ['4', '7'],
    ],
  );
  for (const [a, b] of pairs) assert.notEqual(a.gender, b.gender);
});

test('pair-escalera mixed falls back to last remaining if no opposite gender', () => {
  const ranked = [
    { id: '1', name: '1', gender: 'M' },
    { id: '2', name: '2', gender: 'M' },
    { id: '3', name: '3', gender: 'M' },
    { id: '4', name: '4', gender: 'M' },
  ];
  const pairs = rankingPartnerPairs(ranked, true);
  assert.deepEqual(
    pairs.map((pair) => pair.map((p) => p.id)),
    [
      ['1', '4'],
      ['2', '3'],
    ],
  );
});

test('standing place: medals for 1–3, numbers from 4, ties keep sort order', () => {
  assert.equal(standingPlace(0).medal, '🥇');
  assert.equal(standingPlace(1).medal, '🥈');
  assert.equal(standingPlace(2).medal, '🥉');
  assert.equal(standingPlace(3).medal, '');
  assert.equal(standingPlace(3).label, '4');
  assert.equal(standingPlace(9).label, '10');
  const tied = sortStandings(
    [
      { id: 'a', name: 'Борис', pointsFor: 10, wins: 1, delta: 0 },
      { id: 'b', name: 'Анна', pointsFor: 10, wins: 1, delta: 0 },
      { id: 'c', name: 'Вера', pointsFor: 8, wins: 0, delta: -2 },
    ],
    'points',
  );
  assert.equal(tied[0].name, 'Анна');
  assert.equal(standingPlace(0).medal, '🥇');
  assert.equal(standingPlace(1).medal, '🥈');
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

test('free mixed random next rounds avoid partner repeats', () => {
  const players = players8();
  assert.equal(players.filter((p) => p.gender === 'F').length, 4);
  assert.equal(players.filter((p) => p.gender !== 'F').length, 4);
  const settings = {
    courts: 2,
    pairType: 'mixed',
    pairMethod: 'random',
    pairLock: 'locked',
    tournamentFormat: 'free',
    standingsSort: 'points',
  };
  const rng = mulberry32(99);
  const rounds = [];
  let fixedPairs = [];
  const seen = new Set();
  const byId = new Map(players.map((p) => [p.id, p]));
  for (let i = 0; i < 4; i += 1) {
    const result = generateRound({
      players,
      settings,
      standings: [],
      rounds,
      kind: 'regular',
      fixedPairs,
      rng,
    });
    const keys = result.matches.flatMap((m) => [
      partnerKey(m.teamA[0], m.teamA[1]),
      partnerKey(m.teamB[0], m.teamB[1]),
    ]);
    assert.equal(keys.length, 4);
    for (const match of result.matches) {
      for (const team of [match.teamA, match.teamB]) {
        const g0 = byId.get(team[0])?.gender;
        const g1 = byId.get(team[1])?.gender;
        assert.notEqual(g0, g1, 'mixed pair must be one M and one F');
      }
    }
    for (const key of keys) {
      assert.equal(seen.has(key), false, `partner ${key} repeated on round ${i + 1}`);
      seen.add(key);
    }
    rounds.push({ kind: 'regular', matches: result.matches, fixedPairs: result.fixedPairs });
    fixedPairs = result.fixedPairs;
  }
  assert.equal(seen.size, 16);

  const fifth = generateRound({
    players,
    settings,
    standings: [],
    rounds,
    kind: 'regular',
    fixedPairs,
    rng,
  });
  const fifthKeys = fifth.matches.flatMap((m) => [
    partnerKey(m.teamA[0], m.teamA[1]),
    partnerKey(m.teamB[0], m.teamB[1]),
  ]);
  const counts = partnerCounts(rounds);
  for (const key of fifthKeys) {
    assert.equal(counts.get(key) || 0, 1, 'when repeats are forced, reuse the least-used pairs');
  }
});

test('mixed random reshuffle avoids the current pairing', () => {
  const players = players8();
  const settings = {
    courts: 2,
    pairType: 'mixed',
    pairMethod: 'random',
    pairLock: 'locked',
    tournamentFormat: 'free',
  };
  const first = generateRound({
    players,
    settings,
    kind: 'regular',
    method: 'random',
    rng: mulberry32(3),
  });
  const avoidKeys = first.matches.flatMap((m) => [
    partnerKey(m.teamA[0], m.teamA[1]),
    partnerKey(m.teamB[0], m.teamB[1]),
  ]);
  const second = generateRound({
    players,
    settings,
    kind: 'regular',
    method: 'random',
    rng: mulberry32(4),
    avoidKeys,
  });
  const secondKeys = second.matches.flatMap((m) => [
    partnerKey(m.teamA[0], m.teamA[1]),
    partnerKey(m.teamB[0], m.teamB[1]),
  ]);
  assert.equal(secondKeys.some((k) => avoidKeys.includes(k)), false);
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

test('total-points target 15/17/19/21', () => {
  assert.equal(pointsTarget({ scoringMode: 'total', totalPoints: 21 }, 'regular'), 21);
  assert.equal(pointsTarget({ scoringMode: 'total', totalPoints: 15 }, 'regular'), 15);
  assert.equal(pointsTarget({ scoringMode: 'total', totalPoints: 17 }, 'regular'), 17);
  assert.equal(pointsTarget({ scoringMode: 'total', totalPoints: 19 }, 'regular'), 19);
  assert.equal(pointsTarget({ scoringMode: 'total', totalPoints: 'custom', customTotal: 24 }, 'regular'), 24);
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
  const total = { scoringMode: 'total', totalPoints: 21 };
  assert.deepEqual(applyScoreWithSync({ a: 9, b: 6 }, 'a', 10, points, 'regular').b, 5);
  assert.deepEqual(applyScoreWithSync({ a: 10, b: 5 }, 'b', 7, points, 'regular').a, 8);
  assert.equal(applyScoreWithSync({ a: 9, b: 15 }, 'a', 10, total, 'regular').b, 11);
  assert.equal(applyScoreWithSync({ a: 4, b: 6 }, 'a', 5, games, 'regular').b, 6);
  assert.equal(applyScoreWithSync({ a: 6, b: 4 }, 'b', 3, games, 'regular').a, 6);
  assert.equal(applyScoreWithSync({ a: 4, b: 6 }, 'a', 6, games, 'regular').b, 5);
  assert.equal(applyScoreWithSync({ a: 6, b: 3 }, 'a', 6, gamesNo, 'regular').b, 4);
});

test('games entry never above N and never N:N', () => {
  const n4 = { scoringMode: 'games', setScore: true, gamesToWin: 4, decidingGame: true };
  const n4no = { scoringMode: 'games', setScore: true, gamesToWin: 4, decidingGame: false };
  assert.equal(scoreWheelMax(n4, 'regular'), 4);
  assert.equal(clampScoreValue(5, n4, 'regular'), 4);
  assert.equal(clampScoreValue(8, n4, 'regular'), 4);
  const over = applyScoreWithSync({ a: null, b: null }, 'a', 5, n4, 'regular');
  assert.equal(over.a, 4);
  const tie = applyScoreWithSync({ a: 4, b: 4 }, 'a', 4, n4, 'regular');
  assert.equal(tie.a, 4);
  assert.equal(tie.b, 3);
  assert.equal(isValidSetScore(4, 4, n4), false);
  assert.equal(isValidSetScore(5, 4, n4), false);
  assert.equal(isValidSetScore(4, 3, n4), true);
  const noDec = applyScoreWithSync({ a: 4, b: 4 }, 'a', 4, n4no, 'regular');
  assert.equal(noDec.a, 4);
  assert.equal(noDec.b, 2);
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
  assert.equal(scoreWheelMax({ scoringMode: 'total', totalPoints: 21 }, 'regular'), 21);
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

test('looping wheel wraps both ways and snaps to nearest', () => {
  const values = wheelValues(6);
  assert.equal(values[0], '');
  assert.equal(values[values.length - 1], 6);
  assert.equal(wrapIndex(-1, values.length), values.length - 1);
  assert.equal(wrapIndex(values.length, values.length), 0);
  const cycle = values.length * WHEEL_ITEM_PX;
  const atMax = snapOffset(cycle + (values.length - 1) * WHEEL_ITEM_PX + 4, values.length);
  assert.equal(atMax.index, values.length - 1);
  const pastMax = snapOffset(cycle + values.length * WHEEL_ITEM_PX + 8, values.length);
  assert.equal(pastMax.index, 0);
  const beforeEmpty = snapOffset(cycle - 8, values.length);
  assert.equal(beforeEmpty.index, 0);
  const pad = WHEEL_ITEM_PX;
  assert.equal(wrapLoopScrollTop(cycle - pad - 10, values.length), 2 * cycle - pad - 10);
  assert.equal(wrapLoopScrollTop(2 * cycle - pad + 10, values.length), cycle - pad + 10);
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

test('pair-escalera defaults to 4 games that sum to the limit', () => {
  const s = defaultSettingsFor('pair-escalera');
  assert.equal(s.scoringMode, 'games');
  assert.equal(s.gamesTotal, true);
  assert.equal(s.gamesToWin, 4);
  assert.equal(s.decidingGame, false);
  assert.equal(s.setScore, true);
  assert.equal(usesGamesTotal(s, 'regular'), true);
  assert.equal(usesScoreTotal(s, 'regular'), true);
  assert.equal(s.totalPoints, 21);
  assert.deepEqual(GAMES_TOTAL_PRESETS, [4, 6, 8, 10, 12]);
  assert.equal(scoringSummary(s), '4 гейма');
  s.decidingGame = true;
  assert.equal(scoringSummary(s), '4 гейма + решающий');
  s.gamesToWin = 12;
  assert.equal(scoringSummary(s), '12 геймов + решающий');
  const lunda = defaultSettingsFor('americano');
  assert.equal(lunda.scoringMode, 'total');
  assert.equal(usesGamesTotal(lunda, 'regular'), false);
  assert.equal(usesScoreTotal(lunda, 'regular'), false);
});

test('pair-escalera games total: auto-fill sums to N, decider is half+1', () => {
  const n4 = { scoringMode: 'games', gamesTotal: true, gamesToWin: 4, decidingGame: false };
  const n4dec = { ...n4, decidingGame: true };
  const n12 = { scoringMode: 'games', gamesTotal: true, gamesToWin: 12, decidingGame: false };
  const n12dec = { ...n12, decidingGame: true };
  assert.equal(autoFillGamesTotal(4, 4, false), 0);
  assert.equal(autoFillGamesTotal(3, 4, false), 1);
  assert.equal(autoFillGamesTotal(2, 4, false), 2);
  assert.equal(autoFillGamesTotal(3, 4, true), 2);
  assert.equal(autoFillGamesTotal(4, 4, true), 0);
  assert.equal(autoFillGamesTotal(1, 4, true), 3);
  assert.equal(autoFillGamesTotal(7, 12, true), 6);
  assert.equal(autoFillGamesTotal(7, 12, false), 5);
  assert.equal(autoFillGamesTotal(12, 12, true), 0);
  assert.equal(autoFillScore(3, n4, 'regular'), 1);
  assert.equal(autoFillScore(3, n4dec, 'regular'), 2);
  assert.equal(autoFillScore(7, n12dec, 'regular'), 6);
  assert.equal(applyScoreWithSync({ a: null, b: null }, 'a', 3, n4, 'regular').b, 1);
  assert.equal(applyScoreWithSync({ a: null, b: null }, 'a', 3, n4dec, 'regular').b, 2);
  assert.equal(applyScoreWithSync({ a: 2, b: 2 }, 'a', 3, n4dec, 'regular').b, 2);
  assert.equal(applyScoreWithSync({ a: 3, b: 2 }, 'b', 1, n4dec, 'regular').a, 3);
  assert.equal(scoreWheelMax(n12dec, 'regular'), 12);
});

test('pair-escalera games total: valid scores and match complete', () => {
  const n4 = { scoringMode: 'games', gamesTotal: true, gamesToWin: 4, decidingGame: false };
  const n4dec = { ...n4, decidingGame: true };
  const n12dec = { scoringMode: 'games', gamesTotal: true, gamesToWin: 12, decidingGame: true };
  assert.equal(isValidGamesTotalScore(4, 0, n4), true);
  assert.equal(isValidGamesTotalScore(3, 1, n4), true);
  assert.equal(isValidGamesTotalScore(2, 2, n4), true);
  assert.equal(isValidGamesTotalScore(3, 2, n4), false);
  assert.equal(isValidGamesTotalScore(2, 2, n4dec), false);
  assert.equal(isValidGamesTotalScore(3, 2, n4dec), true);
  assert.equal(isValidGamesTotalScore(3, 1, n4dec), true);
  assert.equal(isValidGamesTotalScore(4, 0, n4dec), true);
  assert.equal(isValidGamesTotalScore(7, 6, n12dec), true);
  assert.equal(isValidGamesTotalScore(6, 6, n12dec), false);
  assert.equal(isValidGamesTotalScore(12, 0, n12dec), true);
  assert.equal(isValidGamesTotalScore(8, 4, n12dec), true);
  assert.equal(matchComplete({ kind: 'regular', games: [{ a: 2, b: 2 }] }, n4, 'regular'), true);
  assert.equal(matchComplete({ kind: 'regular', games: [{ a: 2, b: 2 }] }, n4dec, 'regular'), false);
  assert.equal(matchComplete({ kind: 'regular', games: [{ a: 3, b: 2 }] }, n4dec, 'regular'), true);
  assert.equal(matchComplete({ kind: 'regular', games: [{ a: 7, b: 6 }] }, n12dec, 'regular'), true);
});

test('pair-escalera games total: standings count games and draws', () => {
  const players = players8().slice(0, 4);
  const settings = {
    tournamentFormat: 'pair-escalera',
    scoringMode: 'games',
    gamesTotal: true,
    gamesToWin: 4,
    decidingGame: true,
  };
  const rounds = [
    {
      kind: 'regular',
      scoring: { scoringMode: 'games', gamesTotal: true, gamesToWin: 4, decidingGame: true },
      matches: [{ court: 1, teamA: ['p1', 'p2'], teamB: ['p3', 'p4'], games: [{ a: 3, b: 2 }] }],
    },
    {
      kind: 'regular',
      scoring: { scoringMode: 'games', gamesTotal: true, gamesToWin: 4, decidingGame: false },
      matches: [{ court: 1, teamA: ['p1', 'p2'], teamB: ['p3', 'p4'], games: [{ a: 2, b: 2 }] }],
    },
  ];
  const rows = computeStandings(players, rounds, settings);
  const anna = rows.find((r) => r.id === 'p1');
  assert.equal(anna.wins, 1);
  assert.equal(anna.ties, 1);
  assert.equal(anna.pointsFor, 5);
  assert.equal(anna.pointsAgainst, 4);
  assert.equal(anna.delta, 1);
});

test('old pair-escalera total-points saves still load as Lunda', () => {
  const legacy = {
    tournamentFormat: 'pair-escalera',
    scoringMode: 'total',
    totalPoints: 21,
    gamesToWin: 6,
  };
  assert.equal(usesGamesTotal(legacy, 'regular'), false);
  assert.equal(autoFillScore(15, legacy, 'regular'), 6);
  assert.equal(matchComplete({ kind: 'regular', games: [{ a: 15, b: 6 }] }, legacy, 'regular'), true);
  const snap = scoringSnapshot(legacy);
  assert.equal(snap.scoringMode, 'total');
  assert.equal(snap.gamesTotal, false);
});

test('pair-escalera points total: 15/17/19/21/custom, odd limits ignore deciding', () => {
  const n21 = {
    tournamentFormat: 'pair-escalera',
    scoringMode: 'points',
    gamesTotal: true,
    totalPoints: 21,
    decidingGame: true,
  };
  const n16 = { ...n21, totalPoints: 'custom', customTotal: 16 };
  assert.equal(usesScoreTotal(n21, 'regular'), true);
  assert.equal(usesGamesTotal(n21, 'regular'), false);
  assert.equal(scoreTotalLimit(n21), 21);
  assert.equal(scoreTotalDeciding(n21), false);
  assert.equal(scoreTotalDeciding(n16), true);
  assert.equal(autoFillScore(15, n21, 'regular'), 6);
  assert.equal(autoFillScore(21, n21, 'regular'), 0);
  assert.equal(autoFillScore(9, n16, 'regular'), 8);
  assert.equal(autoFillScore(8, n16, 'regular'), 8);
  assert.equal(isValidGamesTotalScore(21, 0, n21), true);
  assert.equal(isValidGamesTotalScore(11, 10, n21), true);
  assert.equal(isValidGamesTotalScore(11, 11, n21), false);
  assert.equal(isValidGamesTotalScore(8, 8, n16), false);
  assert.equal(isValidGamesTotalScore(9, 8, n16), true);
  assert.equal(isValidGamesTotalScore(16, 0, n16), true);
  assert.equal(matchComplete({ kind: 'regular', games: [{ a: 15, b: 6 }] }, n21, 'regular'), true);
  assert.equal(matchComplete({ kind: 'regular', games: [{ a: 8, b: 8 }] }, n16, 'regular'), false);
  assert.equal(matchComplete({ kind: 'regular', games: [{ a: 9, b: 8 }] }, n16, 'regular'), true);
  assert.equal(scoreWheelMax(n21, 'regular'), 21);
  assert.equal(scoringSummary(n21), '21 очко');
  assert.equal(scoringSummary(n16), '16 очков + решающее');
});

test('pair-escalera points standings count points scored', () => {
  const players = players8().slice(0, 4);
  const settings = {
    tournamentFormat: 'pair-escalera',
    scoringMode: 'points',
    gamesTotal: true,
    totalPoints: 21,
    decidingGame: false,
  };
  const rounds = [
    {
      kind: 'regular',
      scoring: { scoringMode: 'points', gamesTotal: true, totalPoints: 21 },
      matches: [{ court: 1, teamA: ['p1', 'p2'], teamB: ['p3', 'p4'], games: [{ a: 15, b: 6 }] }],
    },
  ];
  const rows = computeStandings(players, rounds, settings);
  const anna = rows.find((r) => r.id === 'p1');
  assert.equal(anna.wins, 1);
  assert.equal(anna.pointsFor, 15);
  assert.equal(anna.pointsAgainst, 6);
  assert.equal(anna.delta, 9);
});
