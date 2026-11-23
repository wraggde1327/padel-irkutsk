import { emptyGame, neededGames } from './scoring.js';
import { formatTitle } from './formats.js';

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
    formatVariant: 'classic',
    mexicanoPairing: '1-4',
    pairLock: 'locked',
    lockedMatchups: 'strength',
    standingsSort: 'points',
    totalPoints: 24,
    customTotal: 24,
    roundsLimit: 'full',
  };
}

/** Настройки по формату. Lunda-подобные: сумма очков 16/21/24/32, без win-by-2. */
export function defaultSettingsFor(format) {
  const settings = defaultSettings();
  settings.tournamentFormat = format || 'free';
  if (format && format !== 'free') {
    settings.scoringMode = 'total';
    settings.totalPoints = 24;
    settings.winByTwo = false;
    settings.qualifyingEnabled = false;
    settings.pairLock = 'unlocked';
  }
  if (format === 'mexicano') settings.mexicanoPairing = '1-4';
  if (format === 'king') settings.kingOfTheCourt = true;
  return settings;
}

export function emptyUi() {
  return {
    screen: 'home',
    activeId: null,
    tab: 'players',
    sort: 'points',
    scoreboard: null,
    toast: '',
    newPairsOpen: false,
    discardUnfinished: false,
    rebuildOffer: null,
    draft: null,
    importAsk: null,
    confirmDeleteId: null,
    renameId: null,
  };
}

export function emptyTournament() {
  return {
    id: 't1',
    name: 'Наш / Свободный',
    createdAt: '',
    updatedAt: '',
    players: [],
    settings: defaultSettings(),
    rounds: [],
    fixedPairs: [],
    nextPlayerNum: 1,
    nextRoundNum: 1,
  };
}

export function emptyStore() {
  return {
    version: 2,
    tournaments: [],
    nextTournamentNum: 1,
    ui: emptyUi(),
  };
}

/** @deprecated используйте emptyStore — оставлено как синоним. */
export function emptyState() {
  return emptyStore();
}

export function nowIso(now = new Date()) {
  return now.toISOString();
}

export function migrateSettings(rawSettings, rounds) {
  const settings = { ...defaultSettings(), ...(rawSettings || {}) };
  if (!rawSettings?.tournamentFormat) {
    settings.tournamentFormat = rawSettings?.kingOfTheCourt ? 'king' : 'free';
  }
  if (settings.mexicanoPairing !== '1-3') settings.mexicanoPairing = '1-4';
  if (settings.pairLock !== 'unlocked') settings.pairLock = 'locked';
  if (settings.lockedMatchups !== 'roundrobin') settings.lockedMatchups = 'strength';
  if (settings.standingsSort !== 'wins') settings.standingsSort = 'points';
  if (settings.formatVariant !== 'mixed' && settings.formatVariant !== 'team') {
    settings.formatVariant = settings.pairType === 'mixed' ? 'mixed' : 'classic';
  }
  if (settings.scoringMode !== 'points' && settings.scoringMode !== 'games' && settings.scoringMode !== 'total') {
    settings.scoringMode = 'points';
  }
  if (!['16', '21', '24', '32', 'custom', 16, 21, 24, 32].includes(settings.totalPoints)) {
    settings.totalPoints = 24;
  }
  if (settings.roundsLimit !== 'full' && !Number.isFinite(Number(settings.roundsLimit))) {
    settings.roundsLimit = 'full';
  }
  if (rawSettings?.setupDone == null && Array.isArray(rounds) && rounds.length > 0) {
    settings.setupDone = true;
  }
  return settings;
}

export function normalizeTournament(raw, fallbackId = 't1') {
  const base = emptyTournament();
  const settings = migrateSettings(raw?.settings, raw?.rounds);
  const name =
    (typeof raw?.name === 'string' && raw.name.trim()) || formatTitle(settings.tournamentFormat);
  return {
    ...base,
    id: typeof raw?.id === 'string' && raw.id ? raw.id : fallbackId,
    name,
    createdAt: typeof raw?.createdAt === 'string' ? raw.createdAt : '',
    updatedAt: typeof raw?.updatedAt === 'string' ? raw.updatedAt : '',
    players: Array.isArray(raw?.players) ? raw.players : [],
    settings,
    rounds: Array.isArray(raw?.rounds) ? raw.rounds : [],
    fixedPairs: Array.isArray(raw?.fixedPairs) ? raw.fixedPairs : [],
    nextPlayerNum: Number(raw?.nextPlayerNum) || 1,
    nextRoundNum: Number(raw?.nextRoundNum) || 1,
  };
}

function looksLikeV1(raw) {
  return Boolean(
    raw &&
      typeof raw === 'object' &&
      (Array.isArray(raw.players) || raw.settings || Array.isArray(raw.rounds)) &&
      !Array.isArray(raw.tournaments),
  );
}

export function migrate(raw) {
  const base = emptyStore();
  if (!raw || typeof raw !== 'object') return base;
  if (raw.version === 2 || Array.isArray(raw.tournaments)) {
    const tournaments = (raw.tournaments || []).map((item, i) =>
      normalizeTournament(item, `t${i + 1}`),
    );
    const ui = { ...base.ui, ...(raw.ui || {}) };
    ui.toast = '';
    ui.newPairsOpen = false;
    ui.rebuildOffer = null;
    ui.importAsk = null;
    ui.draft = ui.draft && typeof ui.draft === 'object' ? ui.draft : null;
    if (!['home', 'create-format', 'create-settings', 'tournament'].includes(ui.screen)) {
      ui.screen = ui.activeId ? 'tournament' : 'home';
    }
    if (!['players', 'play', 'table', 'settings'].includes(ui.tab)) ui.tab = 'players';
    if (ui.screen === 'tournament' && !tournaments.some((t) => t.id === ui.activeId)) {
      ui.screen = 'home';
      ui.activeId = null;
    }
    const maxNum = tournaments.reduce((n, t) => {
      const m = /^t(\d+)$/.exec(t.id);
      return m ? Math.max(n, Number(m[1])) : n;
    }, 0);
    return {
      version: 2,
      tournaments,
      nextTournamentNum: Math.max(Number(raw.nextTournamentNum) || 1, maxNum + 1),
      ui,
    };
  }
  if (looksLikeV1(raw)) {
    const tournament = normalizeTournament(
      {
        ...raw,
        id: 't1',
        name: formatTitle(migrateSettings(raw.settings, raw.rounds).tournamentFormat),
      },
      't1',
    );
    if (!tournament.createdAt) tournament.createdAt = nowIso();
    if (!tournament.updatedAt) tournament.updatedAt = tournament.createdAt;
    return {
      version: 2,
      tournaments: [tournament],
      nextTournamentNum: 2,
      ui: { ...emptyUi(), screen: 'home', activeId: null },
    };
  }
  return base;
}

export function loadState(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return emptyStore();
    return migrate(JSON.parse(raw));
  } catch {
    return emptyStore();
  }
}

export function saveState(state, storage = globalThis.localStorage) {
  const copy = structuredClone(state);
  if (copy.ui) {
    copy.ui.toast = '';
    copy.ui.importAsk = null;
  }
  storage?.setItem(STORAGE_KEY, JSON.stringify(copy));
}

export function clearState(storage = globalThis.localStorage) {
  storage?.removeItem(STORAGE_KEY);
  return emptyStore();
}

export function activeTournament(store) {
  if (!store?.ui?.activeId) return null;
  return store.tournaments.find((t) => t.id === store.ui.activeId) || null;
}

export function touchTournament(tournament, now = new Date()) {
  tournament.updatedAt = nowIso(now);
  return tournament;
}

export function newTournament(store, { name, settings }, now = new Date()) {
  const id = `t${store.nextTournamentNum++}`;
  const format = settings?.tournamentFormat || 'free';
  const tournament = {
    ...emptyTournament(),
    id,
    name: (name && name.trim()) || formatTitle(format),
    createdAt: nowIso(now),
    updatedAt: nowIso(now),
    settings: { ...defaultSettingsFor(format), ...(settings || {}) },
  };
  store.tournaments.push(tournament);
  return tournament;
}

export function cloneImportedTournaments(store, imported, now = new Date()) {
  return imported.map((raw) => {
    const id = `t${store.nextTournamentNum++}`;
    const t = normalizeTournament(raw, id);
    t.id = id;
    t.createdAt = t.createdAt || nowIso(now);
    t.updatedAt = nowIso(now);
    return t;
  });
}

/** Добавить или заменить. Никогда не вызывается без явного mode. */
export function applyImport(store, imported, mode, now = new Date()) {
  const list = Array.isArray(imported) ? imported : [];
  if (!list.length) throw new Error('В файле нет турниров.');
  if (mode === 'add') {
    const added = cloneImportedTournaments(store, list, now);
    store.tournaments.push(...added);
    return { added: added.length, replaced: 0 };
  }
  if (mode === 'replace-all') {
    store.tournaments = [];
    store.ui.activeId = null;
    store.ui.screen = 'home';
    const added = cloneImportedTournaments(store, list, now);
    store.tournaments = added;
    return { added: added.length, replaced: 1 };
  }
  if (mode === 'replace-one') {
    const current = activeTournament(store);
    if (!current) throw new Error('Нет открытого турнира для замены.');
    const next = normalizeTournament(list[0], current.id);
    next.id = current.id;
    next.createdAt = current.createdAt || nowIso(now);
    next.updatedAt = nowIso(now);
    const index = store.tournaments.findIndex((t) => t.id === current.id);
    store.tournaments[index] = next;
    return { added: 0, replaced: 1 };
  }
  throw new Error('Нужно выбрать: добавить или заменить.');
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
