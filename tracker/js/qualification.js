import { matchComplete, settingsForRound } from './scoring.js';

/** Есть ли уже квалификационный круг. */
export function hasQualifyingRound(rounds = []) {
  return rounds.some((r) => r.kind === 'qualifying');
}

export function roundMatchesComplete(round, tournamentSettings) {
  if (!round) return false;
  const settings = settingsForRound(round, tournamentSettings);
  return round.matches.every((m) => matchComplete(m, settings, round.kind));
}

/**
 * Первый круг уже сыгран без квалификации — кнопку и настройку прячем.
 * § tracker: квалификация имеет смысл только до обычных кругов.
 */
export function qualificationTooLate(rounds = [], isComplete) {
  if (hasQualifyingRound(rounds)) return false;
  const first = rounds[0];
  if (!first || first.kind === 'qualifying') return false;
  return typeof isComplete === 'function' ? Boolean(isComplete(first)) : true;
}

/** Квалификация ещё может быть первым кругом: кругов нет. */
export function canStartQualifying(rounds = []) {
  return rounds.length === 0;
}

/** Включена в настройках и ещё не сыграна — первый круг обязан быть ею. */
export function mustStartWithQualifying(settings, rounds = []) {
  return Boolean(settings?.qualifyingEnabled) && !hasQualifyingRound(rounds) && canStartQualifying(rounds);
}

export function assertRoundKindAllowed(settings, rounds = [], kind = 'regular') {
  if (kind === 'qualifying') {
    if (hasQualifyingRound(rounds)) {
      throw new Error('Квалификация уже была.');
    }
    if (rounds.length > 0) {
      throw new Error('Квалификация возможна только первым кругом.');
    }
    return;
  }
  if (mustStartWithQualifying(settings, rounds)) {
    throw new Error('Сначала сыграйте квалификацию.');
  }
}
