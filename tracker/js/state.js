import { emptyGame, neededGames } from './scoring.js';

export const STORAGE_KEY = 'padel-mini-tracker-v1';

export function defaultSettings() {
  return {
    scoringMode: 'points',
    pointsPreset: 15,
    customPoints: 15,
    winByTwo: true,
    gamesPerPairing: 1,
    decidingGame: true,
    qualifyingEnabled: false,
    qualifyingPoints: 15,
    pairType: 'any',
    pairMethod: 'ranking',
    courts: 2,
    kingOfTheCourt: false,
    tournamentFormat: 'free',
    mexicanoPairing: '1-4',
    pairLock: 'locked',
    lockedMatchups: 'strength',
    standingsSort: 'points',
    setupDone: false,
  };
}

export function emptyUi() {
  return {
    tab: 'players',
    sort: 'points',
    scoreboard: null,
    toast: '',
    newPairsOpen: false,
    discardUnfinished: false,
    setupStep: 0,
    rebuildOffer: null,
  };
}

export function emptyState() {
  return {
    version: 1,
    players: [],
    settings: defaultSettings(),
    rounds: [],
    fixedPairs: [],
    nextPlayerNum: 1,
    nextRoundNum: 1,
    ui: emptyUi(),
  };
}

export function loadState(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw);
    return migrate(parsed);
  } catch {
    return emptyState();
  }
}

export function saveState(state, storage = globalThis.localStorage) {
  const copy = structuredClone(state);
  if (copy.ui) copy.ui.toast = '';
  storage?.setItem(STORAGE_KEY, JSON.stringify(copy));
}

export function clearState(storage = globalThis.localStorage) {
  storage?.removeItem(STORAGE_KEY);
  return emptyState();
}

function migrate(raw) {
  const base = emptyState();
  const settings = { ...base.settings, ...(raw.settings || {}) };
  if (!raw.settings?.tournamentFormat) {
    settings.tournamentFormat = raw.settings?.kingOfTheCourt ? 'king' : 'free';
  }
  if (settings.mexicanoPairing !== '1-3') settings.mexicanoPairing = '1-4';
  if (settings.pairLock !== 'unlocked') settings.pairLock = 'locked';
  if (settings.lockedMatchups !== 'roundrobin') settings.lockedMatchups = 'strength';
  if (settings.standingsSort !== 'wins') settings.standingsSort = 'points';
  if (raw.settings?.setupDone == null) {
    settings.setupDone = Array.isArray(raw.rounds) && raw.rounds.length > 0;
  }
  const ui = { ...base.ui, ...(raw.ui || {}) };
  ui.toast = '';
  ui.newPairsOpen = false;
  ui.rebuildOffer = null;
  ui.setupStep = Number(ui.setupStep) || 0;
  return {
    version: 1,
    players: Array.isArray(raw.players) ? raw.players : [],
    settings,
    rounds: Array.isArray(raw.rounds) ? raw.rounds : [],
    fixedPairs: Array.isArray(raw.fixedPairs) ? raw.fixedPairs : [],
    nextPlayerNum: Number(raw.nextPlayerNum) || 1,
    nextRoundNum: Number(raw.nextRoundNum) || 1,
    ui,
  };
}

export function ensureMatchGames(match, settings, kind) {
  const n = neededGames(settings, kind, match.games);
  const games = (match.games || []).slice();
  while (games.length < n) games.push(emptyGame());
  match.games = games;
  return match;
}

export function lastCompletedRound(state) {
  if (!state.rounds.length) return null;
  return state.rounds[state.rounds.length - 1];
}
