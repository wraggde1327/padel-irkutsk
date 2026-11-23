/** Счёт: автозаполнение, теннисное табло, сколько игр играть. */

export const TENNIS_LABELS = ['0', '15', '30', '40'];
export const POINTS_PRESETS = [15, 17, 19, 21];

export function pointsTarget(settings, roundKind) {
  if (roundKind === 'qualifying') return settings.qualifyingPoints;
  if (settings.scoringMode === 'total') {
    return settings.totalPoints === 'custom'
      ? Number(settings.customTotal) || 24
      : Number(settings.totalPoints) || 24;
  }
  if (settings.scoringMode === 'points') {
    return settings.pointsPreset === 'custom'
      ? Number(settings.customPoints) || 15
      : Number(settings.pointsPreset);
  }
  return null;
}

export function gamesToWin(settings) {
  const n = Number(settings.gamesToWin);
  if (Number.isFinite(n) && n >= 1) return Math.round(n);
  return 6;
}

/** Верх барабана и крутилки: 0..цель (очки) или 0..N (геймы). */
export function scoreWheelMax(settings, roundKind) {
  if (settings.scoringMode === 'games' && roundKind !== 'qualifying') return gamesToWin(settings);
  const target = pointsTarget(settings, roundKind);
  if (target == null) return 32;
  return Math.max(0, Number(target));
}

export function scoringSnapshot(settings, { forNewRound = false } = {}) {
  const gamesMode = settings.scoringMode === 'games';
  return {
    scoringMode: settings.scoringMode,
    setScore: gamesMode && (forNewRound || settings.setScore === true),
    gamesToWin: gamesToWin(settings),
    gamesPerPairing: settings.gamesPerPairing,
    decidingGame: Boolean(settings.decidingGame),
    pointsPreset: settings.pointsPreset,
    customPoints: settings.customPoints,
    winByTwo: Boolean(settings.winByTwo),
    totalPoints: settings.totalPoints,
    customTotal: settings.customTotal,
    qualifyingPoints: settings.qualifyingPoints,
  };
}

export function settingsForRound(round, tournamentSettings) {
  if (round?.scoring && typeof round.scoring === 'object') {
    return { ...tournamentSettings, ...round.scoring };
  }
  return tournamentSettings;
}

export function freezeRoundScoring(rounds, settings) {
  const snap = scoringSnapshot(settings);
  for (const round of rounds || []) {
    if (!round.scoring) round.scoring = { ...snap };
  }
}

/** Режим Lunda: матч до суммы очков, без «с разницей в 2». */
export function usesTotalPoints(settings, roundKind) {
  return roundKind !== 'qualifying' && settings?.scoringMode === 'total';
}

/** Игра до фиксированной суммы: второе поле = цель − введённое. При «с разницей в 2» не заполняем. */
export function autoFillOther(entered, target, winByTwo) {
  if (winByTwo) return null;
  if (target == null || !Number.isFinite(Number(target))) return null;
  if (entered === '' || entered == null) return null;
  const n = Number(entered);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Number(target) - Math.max(0, Math.round(n)));
}

/**
 * Геймы до N. Если ввели меньше N — вторая сторона N.
 * Если ввели N и есть решающий — не заполняем (неоднозначно).
 * Если ввели N без решающего — подставляем N-2.
 */
export function autoFillGames(entered, n, decidingGame) {
  if (entered === '' || entered == null) return null;
  const v = Number(entered);
  const N = Math.max(1, Number(n) || 6);
  if (!Number.isFinite(v) || v < 0) return null;
  if (v < N) return N;
  if (v === N) return decidingGame ? null : Math.max(0, N - 2);
  return null;
}

export function autoFillScore(entered, settings, roundKind) {
  if (settings.scoringMode === 'games' && settings.setScore && roundKind !== 'qualifying') {
    return autoFillGames(entered, gamesToWin(settings), settings.decidingGame);
  }
  const winByTwo =
    roundKind === 'qualifying' || usesTotalPoints(settings, roundKind) ? false : Boolean(settings.winByTwo);
  return autoFillOther(entered, pointsTarget(settings, roundKind), winByTwo);
}

/**
 * Живой пересчёт второй стороны: любое изменение слева пересчитывает право
 * и наоборот, даже если там уже есть значение. Если правило неоднозначно
 * (решающий при N, «с разницей в 2»), другую сторону не трогаем.
 */
export function applyScoreWithSync(game, side, parsed, settings, roundKind, { fromUser = true } = {}) {
  const otherSide = side === 'a' ? 'b' : 'a';
  const next = {
    ...game,
    tennis: game.tennis || { ptsA: 0, ptsB: 0 },
    touched: { a: false, b: false, ...(game.touched || {}) },
  };
  next[side] = parsed;
  next.touched[side] = parsed != null;
  if (fromUser) {
    const other = autoFillScore(parsed, settings, roundKind);
    if (other != null) {
      next[otherSide] = other;
    }
  }
  return next;
}

/** Валидный сет: победитель ровно N, проигравший ≤ N-1 (решающий) или ≤ N-2. */
export function isValidSetScore(a, b, settings) {
  if (!Number.isFinite(Number(a)) || !Number.isFinite(Number(b))) return false;
  const left = Number(a);
  const right = Number(b);
  if (left === right) return false;
  const N = gamesToWin(settings);
  const hi = Math.max(left, right);
  const lo = Math.min(left, right);
  if (hi !== N || lo < 0) return false;
  return settings.decidingGame ? lo <= N - 1 : lo <= N - 2;
}

function isFilledScore(value) {
  if (value === null || value === undefined || value === '') return false;
  return Number.isFinite(Number(value));
}

export function isGameComplete(game) {
  if (!game) return false;
  return isFilledScore(game.a) && isFilledScore(game.b);
}

export function gameWins(games) {
  let a = 0;
  let b = 0;
  for (const g of games) {
    if (!isGameComplete(g)) continue;
    if (g.a > g.b) a += 1;
    else if (g.b > g.a) b += 1;
  }
  return { a, b };
}

export function gamesSum(games) {
  let a = 0;
  let b = 0;
  for (const g of games) {
    if (!isGameComplete(g)) continue;
    a += Number(g.a);
    b += Number(g.b);
  }
  return { a, b };
}

/**
 * Слотов счёта в карточке. Квалификация, очки и геймы (сет до N) — одна строка.
 * Старые круги с несколькими геймами оставляем как есть.
 */
export function neededGames(settings, roundKind, games) {
  if (roundKind === 'qualifying') return 1;
  if (settings.scoringMode === 'games' && !settings.setScore) {
    const base = Math.max(1, Number(settings.gamesPerPairing) || 1);
    if (base > 1) {
      if (!settings.decidingGame) return base;
      const played = (games || []).slice(0, base).filter(isGameComplete);
      if (played.length < base) return base;
      const wins = gameWins(played);
      const pts = gamesSum(played);
      if (wins.a === wins.b || pts.a === pts.b) return base + 1;
      return base;
    }
  }
  return 1;
}

export function countedGames(match, settings) {
  const n = neededGames(settings, match.kind || match.roundKind, match.games);
  return (match.games || []).slice(0, n);
}

export function matchComplete(match, settings, roundKind) {
  const kind = roundKind || match.kind;
  const n = neededGames(settings, kind, match.games);
  const games = (match.games || []).slice(0, n);
  if (games.length < n || !games.every(isGameComplete)) return false;
  if (settings.scoringMode === 'games' && settings.setScore && kind !== 'qualifying') {
    return games.every((g) => isValidSetScore(g.a, g.b, settings));
  }
  return true;
}

export function emptyGame() {
  return { a: null, b: null, tennis: { ptsA: 0, ptsB: 0 }, touched: { a: false, b: false } };
}

export function tennisLabel(ptsA, ptsB) {
  if (ptsA >= 3 && ptsB >= 3) return { a: '40', b: '40', golden: true };
  return {
    a: TENNIS_LABELS[Math.min(ptsA, 3)] || '0',
    b: TENNIS_LABELS[Math.min(ptsB, 3)] || '0',
    golden: false,
  };
}

/** Золотая при 40-40: следующее очко выигрывает гейм. */
export function applyTennisPoint(game, side) {
  const tennis = game.tennis || { ptsA: 0, ptsB: 0 };
  let { ptsA, ptsB } = tennis;
  const a = Number(game.a) || 0;
  const b = Number(game.b) || 0;
  if (ptsA >= 3 && ptsB >= 3) {
    if (side === 'a') return { a: a + 1, b, tennis: { ptsA: 0, ptsB: 0 } };
    return { a, b: b + 1, tennis: { ptsA: 0, ptsB: 0 } };
  }
  if (side === 'a') ptsA += 1;
  else ptsB += 1;
  if (ptsA >= 4 && ptsA - ptsB >= 1) {
    return { a: a + 1, b, tennis: { ptsA: 0, ptsB: 0 } };
  }
  if (ptsB >= 4 && ptsB - ptsA >= 1) {
    return { a, b: b + 1, tennis: { ptsA: 0, ptsB: 0 } };
  }
  return { a, b, tennis: { ptsA, ptsB } };
}
