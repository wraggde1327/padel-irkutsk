/** Счёт: автозаполнение, теннисное табло, сколько игр играть. */

export const TENNIS_LABELS = ['0', '15', '30', '40'];

export function pointsTarget(settings, roundKind) {
  if (roundKind === 'qualifying') return settings.qualifyingPoints;
  if (settings.scoringMode === 'points') {
    return settings.pointsPreset === 'custom'
      ? Number(settings.customPoints) || 15
      : Number(settings.pointsPreset);
  }
  return null;
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
 * Сколько игр должна сыграть пара.
 * Квалификация — одна игра. Обычный круг — gamesPerPairing, плюс решающая при ничьей.
 */
export function neededGames(settings, roundKind, games) {
  if (roundKind === 'qualifying') return 1;
  const base = Math.max(1, Number(settings.gamesPerPairing) || 2);
  if (!settings.decidingGame) return base;
  const played = (games || []).slice(0, base).filter(isGameComplete);
  if (played.length < base) return base;
  const wins = gameWins(played);
  const pts = gamesSum(played);
  if (wins.a === wins.b || pts.a === pts.b) return base + 1;
  return base;
}

export function countedGames(match, settings) {
  const n = neededGames(settings, match.kind || match.roundKind, match.games);
  return (match.games || []).slice(0, n);
}

export function matchComplete(match, settings, roundKind) {
  const kind = roundKind || match.kind;
  const n = neededGames(settings, kind, match.games);
  const games = (match.games || []).slice(0, n);
  return games.length >= n && games.every(isGameComplete);
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
