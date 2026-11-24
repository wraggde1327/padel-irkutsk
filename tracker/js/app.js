import { generateRound, kingOfTheCourtGroups, genderCounts, autoCourts, partnerKey } from './pairing.js';
import {
  applyScoreWithSync,
  emptyGame,
  freezeRoundScoring,
  isGameComplete,
  matchComplete,
  neededGames,
  scoringSnapshot,
  settingsForRound,
} from './scoring.js';
import { attachLoopingWheel, scrollWheelTo, syncScoreWheels } from './wheel.js';
import { computeStandings } from './standings.js';
import {
  activeTournament,
  applyImport,
  defaultSettingsFor,
  emptyStore,
  ensureMatchGames,
  isFinished,
  loadState,
  newTournament,
  nowIso,
  saveState,
  touchTournament,
} from './state.js';
import { formatTitle } from './formats.js';
import { renderApp } from './render.js';
import { mustStartWithQualifying } from './qualification.js';
import { buildExportPayload, downloadJson, exportFileName, parseImportJson } from './backup.js';

const root = document.getElementById('app');
const fileInput = document.getElementById('import-file');
let store = loadState();
let pickerTyping = false;
let scrollAfterPaint = null;
let lastPaintKey = '';
let chromeObserver = null;

function pageScroller() {
  return document.scrollingElement || document.documentElement;
}

function syncChromeInsets() {
  if (!root) return;
  const tabs = root.querySelector('.tabs');
  const botH = tabs ? Math.round(tabs.getBoundingClientRect().height) : 0;
  root.style.setProperty('--chrome-bottom', `${botH}px`);
}

function watchChromeInsets() {
  syncChromeInsets();
  if (typeof ResizeObserver === 'undefined') return;
  if (!chromeObserver) {
    chromeObserver = new ResizeObserver(() => syncChromeInsets());
  }
  chromeObserver.disconnect();
  const tabs = root.querySelector('.tabs');
  if (tabs) chromeObserver.observe(tabs);
}

function paintContextKey() {
  return `${store.ui.screen || ''}|${store.ui.activeId || ''}|${store.ui.tab || ''}`;
}

function restoreMainScroll(top) {
  const apply = () => {
    pageScroller().scrollTop = top;
  };
  apply();
  requestAnimationFrame(() => {
    apply();
    requestAnimationFrame(apply);
  });
}

function persist() {
  saveState(store);
}

function setHash(tab) {
  const url = tab ? `${location.pathname}${location.search}#${tab}` : `${location.pathname}${location.search}`;
  const current = `${location.pathname}${location.search}${location.hash}`;
  if (current === url) return;
  history.replaceState(null, '', url);
}

function tournament() {
  return activeTournament(store);
}

function toast(message) {
  store.ui.toast = message;
  paint();
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => {
    if (store.ui.toast === message) {
      store.ui.toast = '';
      paint();
    }
  }, 3200);
}

function paint() {
  const scroller = pageScroller();
  const paintKey = paintContextKey();
  const keepScroll = Boolean(scroller && paintKey === lastPaintKey && !scrollAfterPaint);
  const savedScroll = keepScroll ? scroller.scrollTop : 0;
  const active = document.activeElement;
  const tag = active && active.tagName;
  const restoreFocus = tag === 'INPUT' || tag === 'TEXTAREA';
  const id = restoreFocus && active.id ? active.id : '';
  const keepType = pickerTyping && id === 'picker-score-input';
  const start = active && typeof active.selectionStart === 'number' ? active.selectionStart : null;
  const end = active && typeof active.selectionEnd === 'number' ? active.selectionEnd : null;
  renderApp(root, store);
  watchChromeInsets();
  persist();
  bindScoreWheels();
  lastPaintKey = paintKey;
  const backupOpen = Boolean(store.ui.backupOpen);
  document.documentElement.classList.toggle('is-backup-open', backupOpen);
  document.body.classList.toggle('is-backup-open', backupOpen);
  if (keepScroll) restoreMainScroll(savedScroll);
  if (keepType) {
    startTyping();
    const el = document.getElementById('picker-score-input');
    if (el && start != null && typeof el.setSelectionRange === 'function') {
      try {
        el.setSelectionRange(start, end ?? start);
      } catch {
        /* not a text input */
      }
    }
    scrollToPaintTarget();
    return;
  }
  if (id && id !== 'picker-score-input') {
    const el = document.getElementById(id);
    if (el && typeof el.focus === 'function') {
      el.focus({ preventScroll: true });
      if (start != null && typeof el.setSelectionRange === 'function') {
        try {
          el.setSelectionRange(start, end ?? start);
        } catch {
          /* not a text input */
        }
      }
    }
  }
  scrollToPaintTarget();
}

function scrollToPaintTarget() {
  const target = scrollAfterPaint;
  scrollAfterPaint = null;
  if (!target) return;
  requestAnimationFrame(() => {
    const el = document.getElementById(target);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 8;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  });
}

function closeScorePicker() {
  store.ui.scorePicker = null;
  pickerTyping = false;
}

function startTyping() {
  pickerTyping = true;
  const input = document.getElementById('picker-score-input');
  if (!(input instanceof HTMLInputElement)) return;
  input.classList.remove('is-hidden');
  input.focus({ preventScroll: true });
  input.select();
}

function bindScoreWheels() {
  const open = Boolean(store.ui.scorePicker);
  document.documentElement.classList.toggle('is-picker-open', open);
  document.body.classList.toggle('is-picker-open', open);
  for (const el of root.querySelectorAll('[data-wheel]')) {
    bindPickerWheel(el);
  }
  const backdrop = root.querySelector('[data-picker-backdrop]');
  if (backdrop) {
    backdrop.addEventListener(
      'touchmove',
      (event) => {
        if (!event.target.closest('[data-wheel]')) event.preventDefault();
      },
      { passive: false },
    );
  }
  const input = document.getElementById('picker-score-input');
  if (input instanceof HTMLInputElement) {
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      pickerTyping = false;
      setScore(Number(input.dataset.round), input.dataset.court, input.dataset.game, input.dataset.side, input.value, true);
    });
    input.addEventListener('blur', () => {
      if (!pickerTyping) return;
      pickerTyping = false;
      setScore(Number(input.dataset.round), input.dataset.court, input.dataset.game, input.dataset.side, input.value, true);
    });
  }
  requestAnimationFrame(() => syncScoreWheels(root));
}

function bindPickerWheel(el) {
  attachLoopingWheel(el, {
    onCommit(raw) {
      setScore(Number(el.dataset.round), el.dataset.court, el.dataset.game, el.dataset.side, raw, true);
    },
    onCenterTap() {
      startTyping();
    },
  });
}

const SCORING_KEYS = new Set([
  'scoringMode',
  'gamesToWin',
  'decidingGame',
  'pointsPreset',
  'customPoints',
  'winByTwo',
  'totalPoints',
  'customTotal',
  'qualifyingPoints',
  'gamesPerPairing',
]);

function patchLiveSettings(t, patch) {
  const keys = Object.keys(patch);
  if (keys.some((key) => SCORING_KEYS.has(key))) freezeRoundScoring(t.rounds, t.settings);
  for (const [key, value] of Object.entries(patch)) {
    patchSettings(t.settings, key, key === 'gamesToWin' ? Number(value) : value);
  }
  if (t.settings.scoringMode === 'games') t.settings.setScore = true;
  if (t.settings.scoringMode === 'total') t.settings.winByTwo = false;
}

function findPlayer(id) {
  return tournament()?.players.find((p) => p.id === id);
}

function addPlayer(name) {
  const t = tournament();
  if (!t || isFinished(t)) return;
  const trimmed = name.trim();
  if (!trimmed) return;
  if ((t.settings.tournamentFormat || '') === 'pair-escalera' && t.players.length >= 8) {
    toast('В этом режиме ровно 8 игроков.');
    return;
  }
  const gender = t.players.length % 2 === 0 ? 'M' : 'F';
  t.players.push({
    id: `p${t.nextPlayerNum++}`,
    name: trimmed,
    gender,
  });
  t.settings.courts = Math.max(1, autoCourts(t.players.length));
  touchTournament(t);
  paint();
}

function lastRound() {
  const t = tournament();
  return t?.rounds[t.rounds.length - 1] || null;
}

function roundIsComplete(round) {
  const t = tournament();
  if (!round || !t) return false;
  const settings = settingsForRound(round, t.settings);
  return round.matches.every((m) => matchComplete(m, settings, round.kind));
}

function roundHasScores(round) {
  return Boolean(
    round &&
      round.matches.some((m) =>
        (m.games || []).some((g) => g && ((g.a != null && g.a !== '') || (g.b != null && g.b !== ''))),
      ),
  );
}

function resolveUnfinished({ discard, replaceEmpty }) {
  const t = tournament();
  if (!t) return;
  const last = lastRound();
  if (!last || roundIsComplete(last)) return;
  if (!roundHasScores(last)) {
    if (replaceEmpty) t.rounds.pop();
    return;
  }
  if (discard) {
    t.rounds.pop();
    return;
  }
  for (const match of last.matches) {
    match.games = (match.games || []).filter(isGameComplete);
  }
  last.closedEarly = true;
}

function partnerKeysOf(round) {
  if (!round?.matches) return [];
  return round.matches.flatMap((m) => [
    partnerKey(m.teamA[0], m.teamA[1]),
    partnerKey(m.teamB[0], m.teamB[1]),
  ]);
}

function generate(kind, method = null, avoidKeys = null) {
  const t = tournament();
  if (!t || isFinished(t)) return;
  if (kind !== 'qualifying' && mustStartWithQualifying(t.settings, t.rounds)) {
    toast('Сначала сыграйте квалификацию.');
    return;
  }
  try {
    const { m, f } = genderCounts(t.players);
    if (
      (t.settings.tournamentFormat || '') !== 'pair-escalera' &&
      (t.settings.pairType === 'mixed' || t.settings.formatVariant === 'mixed') &&
      m !== f
    ) {
      t.settings.pairType = 'any';
      if (t.settings.formatVariant === 'mixed') t.settings.formatVariant = 'classic';
    }
    const standings = computeStandings(t.players, t.rounds, t.settings);
    const last = lastRound();
    let courtGroups = null;
    if (
      kind === 'regular' &&
      !method &&
      (t.settings.tournamentFormat || 'free') === 'free' &&
      t.settings.kingOfTheCourt &&
      last &&
      roundIsComplete(last)
    ) {
      courtGroups = kingOfTheCourtGroups(last.matches, settingsForRound(last, t.settings), last.kind);
    }
    freezeRoundScoring(t.rounds, t.settings);
    const result = generateRound({
      players: t.players,
      settings: t.settings,
      standings,
      rounds: t.rounds,
      kind,
      courtGroups,
      method,
      fixedPairs: t.fixedPairs,
      avoidKeys,
    });
    const round = {
      id: `r${t.nextRoundNum}`,
      number: kind === 'qualifying' ? 0 : t.rounds.filter((r) => r.kind === 'regular').length + 1,
      kind,
      format: result.format || (method ? 'free' : t.settings.tournamentFormat || 'free'),
      matches: result.matches,
      note: result.note || '',
      sitting: result.sitting || [],
      courtGroups: result.courtGroups || null,
      playerOrder: result.playerOrder || null,
      fixedPairs: result.fixedPairs || null,
      override: Boolean(result.override || method),
      closedEarly: false,
      scoring: scoringSnapshot(t.settings, { forNewRound: true }),
      cycleSlot: result.cycleSlot ?? null,
    };
    if (result.fixedPairs) t.fixedPairs = result.fixedPairs;
    t.settings.courts = Math.max(1, autoCourts(t.players.length));
    const roundSettings = settingsForRound(round, t.settings);
    for (const match of round.matches) ensureMatchGames(match, roundSettings, kind);
    t.nextRoundNum += 1;
    t.rounds.push(round);
    store.ui.tab = 'play';
    store.ui.newPairsOpen = false;
    store.ui.expandedRoundIds = [];
    touchTournament(t);
    if (result.warning) toast(result.warning);
    else paint();
  } catch (err) {
    toast(err instanceof Error ? err.message : 'Не удалось сгенерировать пары');
    paint();
  }
}

function applyNewPairs(method) {
  const t = tournament();
  if (t && method) t.settings.pairMethod = method;
  const last = lastRound();
  const complete = roundIsComplete(last);
  const hasScores = roundHasScores(last);
  let avoidKeys = [];
  if (last && !complete && hasScores) {
    resolveUnfinished({ discard: store.ui.discardUnfinished, replaceEmpty: false });
  } else if (last && !complete && !hasScores) {
    avoidKeys = partnerKeysOf(last);
    tournament()?.rounds.pop();
  }
  generate('regular', method, avoidKeys);
}

let scorePaintTimer = 0;

function scoreBoxText(value) {
  return value == null || value === '' ? '—' : String(value);
}

function writeLiveScore(roundIndex, court, gameIndex, side, value) {
  const box = document.getElementById(`score-r${roundIndex}-c${court}-g${gameIndex}-${side}`);
  if (box) box.textContent = scoreBoxText(value);
  const picker = store.ui.scorePicker;
  if (
    picker &&
    Number(picker.round) === Number(roundIndex) &&
    Number(picker.court) === Number(court) &&
    Number(picker.game) === Number(gameIndex) &&
    picker.side !== side
  ) {
    const hint = document.getElementById('picker-other-score');
    if (hint) hint.textContent = value == null || value === '' ? '–' : String(value);
  }
}

function setScore(roundIndex, court, gameIndex, side, raw, fromUser, opts = {}) {
  const t = tournament();
  if (!t || isFinished(t)) return;
  const round = t.rounds[roundIndex];
  if (!round) return;
  const match = round.matches.find((m) => m.court === Number(court));
  if (!match) return;
  const settings = settingsForRound(round, t.settings);
  const beforeSlots = neededGames(settings, round.kind, match.games);
  ensureMatchGames(match, settings, round.kind);
  const game = match.games[Number(gameIndex)] || emptyGame();
  const parsed = raw === '' || raw == null ? null : Number.isFinite(Number(raw)) ? Number(raw) : null;
  const otherSide = side === 'a' ? 'b' : 'a';
  const next = applyScoreWithSync(game, side, parsed, settings, round.kind, { fromUser });
  const filledOther = fromUser && next[otherSide] !== game[otherSide] ? { otherSide, other: next[otherSide] } : null;
  match.games[Number(gameIndex)] = next;
  ensureMatchGames(match, settings, round.kind);
  touchTournament(t);
  persist();
  writeLiveScore(roundIndex, court, gameIndex, side, parsed);
  const selfWheel = root.querySelector(
    `[data-wheel][data-round="${roundIndex}"][data-court="${court}"][data-game="${gameIndex}"][data-side="${side}"]`,
  );
  if (selfWheel instanceof HTMLElement) {
    selfWheel.dataset.value = parsed == null ? '' : String(parsed);
    selfWheel.dataset.syncing = '1';
    scrollWheelTo(selfWheel, parsed, true);
  }
  if (filledOther) {
    writeLiveScore(roundIndex, court, gameIndex, filledOther.otherSide, filledOther.other);
  }
  const afterSlots = neededGames(settings, round.kind, match.games);
  maybeOfferRebuild(roundIndex);
  window.clearTimeout(scorePaintTimer);
  if (afterSlots !== beforeSlots) {
    paint();
    return;
  }
  if (opts.skipPaint || store.ui.scorePicker) return;
  scorePaintTimer = window.setTimeout(() => paint(), 180);
}

function maybeOfferRebuild(editedIndex) {
  const t = tournament();
  if (!t) return;
  const next = t.rounds[editedIndex + 1];
  if (!next) {
    store.ui.rebuildOffer = null;
    return;
  }
  const hasScores = next.matches.some((m) => (m.games || []).some(isGameComplete));
  store.ui.rebuildOffer = hasScores ? null : editedIndex + 1;
}

function rebuildNextRound() {
  const t = tournament();
  const index = store.ui.rebuildOffer;
  if (!t || index == null || !t.rounds[index]) return;
  try {
    const standings = computeStandings(t.players, t.rounds.slice(0, index), t.settings);
    const prev = t.rounds[index - 1];
    let courtGroups = null;
    if ((t.settings.tournamentFormat || 'free') === 'free' && t.settings.kingOfTheCourt && prev) {
      courtGroups = kingOfTheCourtGroups(prev.matches, settingsForRound(prev, t.settings), prev.kind);
    }
    const result = generateRound({
      players: t.players,
      settings: t.settings,
      standings,
      rounds: t.rounds.slice(0, index),
      kind: t.rounds[index].kind,
      courtGroups,
      fixedPairs: prev?.fixedPairs || t.fixedPairs,
    });
    const round = t.rounds[index];
    round.matches = result.matches;
    round.note = result.note || '';
    round.sitting = result.sitting || [];
    round.courtGroups = result.courtGroups || null;
    round.fixedPairs = result.fixedPairs || round.fixedPairs;
    round.playerOrder = result.playerOrder || round.playerOrder;
    if (!round.scoring) round.scoring = scoringSnapshot(t.settings, { forNewRound: true });
    const roundSettings = settingsForRound(round, t.settings);
    for (const match of round.matches) ensureMatchGames(match, roundSettings, round.kind);
    if (result.fixedPairs) t.fixedPairs = result.fixedPairs;
    store.ui.rebuildOffer = null;
    touchTournament(t);
    toast('Следующий круг пересобран.');
  } catch (err) {
    toast(err instanceof Error ? err.message : 'Не удалось пересобрать');
  }
}

function openTournament(id) {
  const t = store.tournaments.find((item) => item.id === id);
  if (!t) return;
  store.ui.activeId = id;
  store.ui.screen = 'tournament';
  store.ui.tab = isFinished(t) ? 'table' : t.rounds.length ? 'play' : 'players';
  store.ui.renameId = null;
  store.ui.expandedRoundIds = [];
  setHash(store.ui.tab);
  paint();
}

function goHome() {
  store.ui.screen = 'home';
  store.ui.activeId = null;
  store.ui.tab = 'players';
  store.ui.draft = null;
  store.ui.newPairsOpen = false;
  store.ui.backupOpen = false;
  store.ui.rebuildOffer = null;
  store.ui.renameId = null;
  closeScorePicker();
  setHash('');
  paint();
}

function startCreate() {
  store.ui.screen = 'create-format';
  store.ui.draft = null;
  store.ui.backupOpen = false;
  paint();
}

function pickFormat(format) {
  const settings = defaultSettingsFor(format);
  store.ui.draft = {
    format,
    name: formatTitle(format),
    settings,
  };
  store.ui.screen = 'create-settings';
  paint();
}

function finishCreate() {
  const draft = store.ui.draft;
  if (!draft) return;
  if (draft.settings.formatVariant === 'mixed') draft.settings.pairType = 'mixed';
  if (draft.settings.pairType === 'mixed' && draft.settings.formatVariant === 'classic') {
    draft.settings.formatVariant = 'mixed';
  }
  const created = newTournament(store, { name: draft.name, settings: draft.settings });
  store.ui.draft = null;
  store.ui.activeId = created.id;
  store.ui.screen = 'tournament';
  store.ui.tab = 'players';
  setHash('players');
  paint();
}

function patchSettings(target, key, value) {
  target[key] = value;
  if (key === 'formatVariant') {
    if (value === 'mixed') target.pairType = 'mixed';
    else if (target.pairType === 'mixed' && value === 'classic') target.pairType = 'any';
  }
  if (key === 'pairType') {
    if (value === 'mixed' && target.formatVariant === 'classic') target.formatVariant = 'mixed';
    if (value === 'any' && target.formatVariant === 'mixed') target.formatVariant = 'classic';
  }
  if (key === 'standingsSort') store.ui.sort = value;
}

function exportTournaments(list, label) {
  if (!list.length) {
    toast('Нечего экспортировать.');
    return;
  }
  const payload = buildExportPayload(list);
  downloadJson(exportFileName(label), payload);
  toast('Файл сохранён.');
}

function openImportPicker() {
  if (!fileInput) {
    toast('Не удалось открыть файл.');
    return;
  }
  fileInput.value = '';
  fileInput.click();
}

function onImportFile(event) {
  const input = event.target;
  const file = input instanceof HTMLInputElement ? input.files?.[0] : null;
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const tournaments = parseImportJson(String(reader.result || ''));
      if (!store.tournaments.length && store.ui.screen !== 'tournament') {
        store.ui.backupOpen = false;
        applyImport(store, tournaments, 'add');
        toast(`Добавлено: ${tournaments.length}`);
        paint();
        return;
      }
      store.ui.backupOpen = false;
      store.ui.importAsk = { tournaments };
      paint();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Не удалось прочитать файл');
    }
  };
  reader.onerror = () => toast('Не удалось прочитать файл');
  reader.readAsText(file);
}

function confirmImport(mode) {
  const ask = store.ui.importAsk;
  if (!ask) return;
  try {
    const result = applyImport(store, ask.tournaments, mode);
    store.ui.importAsk = null;
    if (mode === 'replace-one') toast('Этот турнир заменён из файла.');
    else if (mode === 'replace-all') toast(`Заменено. Турниров: ${result.added}.`);
    else toast(`Добавлено: ${result.added}`);
    paint();
  } catch (err) {
    store.ui.importAsk = null;
    toast(err instanceof Error ? err.message : 'Импорт не выполнен');
  }
}

function onClick(event) {
  if (event.target.closest('[data-picker-sheet]')) {
    const inside = event.target.closest('[data-action]');
    if (inside?.dataset.action === 'confirm-score-picker') {
      closeScorePicker();
      paint();
    }
    return;
  }
  if (event.target.closest('[data-picker-backdrop]')) {
    closeScorePicker();
    paint();
    return;
  }
  if (event.target.closest('[data-backup-backdrop]') && !event.target.closest('[data-backup-sheet]')) {
    store.ui.backupOpen = false;
    paint();
    return;
  }
  const btn = event.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const t = tournament();
  const frozen = new Set([
    'gender',
    'remove-player',
    'gen-round',
    'rebuild-next',
    'rebuild-skip',
    'toggle-bool',
    'setting-val',
    'open-new-pairs',
    'close-new-pairs',
    'new-pairs',
    'preset',
    'qual-pts',
    'total-pts',
    'open-score-picker',
    'finish-tournament',
  ]);
  if (t && isFinished(t) && frozen.has(action)) return;
  if (action === 'tab') {
    store.ui.tab = btn.dataset.tab;
    setHash(btn.dataset.tab);
    closeScorePicker();
    paint();
    return;
  }
  if (action === 'go-home') {
    goHome();
    return;
  }
  if (action === 'create') {
    startCreate();
    return;
  }
  if (action === 'pick-format') {
    pickFormat(btn.dataset.format);
    return;
  }
  if (action === 'create-back') {
    store.ui.screen = 'create-format';
    paint();
    return;
  }
  if (action === 'create-ok') {
    finishCreate();
    return;
  }
  if (action === 'open-tournament') {
    openTournament(btn.dataset.id);
    return;
  }
  if (action === 'rename-tournament') {
    store.ui.renameId = btn.dataset.id;
    paint();
    return;
  }
  if (action === 'delete-tournament') {
    const item = store.tournaments.find((x) => x.id === btn.dataset.id);
    if (!item) return;
    if (window.confirm(`Удалить «${item.name}»? Это нельзя отменить.`)) {
      store.tournaments = store.tournaments.filter((x) => x.id !== item.id);
      if (store.ui.activeId === item.id) {
        store.ui.activeId = null;
        store.ui.screen = 'home';
      }
      paint();
    }
    return;
  }
  if (action === 'open-backup') {
    store.ui.backupOpen = true;
    paint();
    return;
  }
  if (action === 'close-backup') {
    store.ui.backupOpen = false;
    paint();
    return;
  }
  if (action === 'export-all') {
    store.ui.backupOpen = false;
    exportTournaments(store.tournaments, 'turniry');
    return;
  }
  if (action === 'export-one') {
    if (!t) return;
    exportTournaments([t], t.name || 'turnir');
    return;
  }
  if (action === 'import-file') {
    openImportPicker();
    return;
  }
  if (action === 'import-add') {
    confirmImport('add');
    return;
  }
  if (action === 'import-replace-all') {
    if (window.confirm('Заменить все турниры в этом браузере данными из файла?')) {
      confirmImport('replace-all');
    }
    return;
  }
  if (action === 'import-replace-one') {
    if (window.confirm('Заменить этот турнир данными из файла?')) {
      confirmImport('replace-one');
    }
    return;
  }
  if (action === 'import-cancel') {
    store.ui.importAsk = null;
    paint();
    return;
  }
  if (action === 'open-settings') {
    store.ui.tab = 'settings';
    store.ui.fileCardOpen = false;
    setHash('settings');
    closeScorePicker();
    paint();
    return;
  }
  if (action === 'toggle-file-card') {
    store.ui.fileCardOpen = !store.ui.fileCardOpen;
    persist();
    const card = root.querySelector('#file-card');
    const toggle = card?.querySelector('.file-card-toggle');
    if (card && toggle) {
      card.classList.toggle('is-open', store.ui.fileCardOpen);
      toggle.setAttribute('aria-expanded', store.ui.fileCardOpen ? 'true' : 'false');
    } else {
      paint();
    }
    return;
  }
  if (action === 'finish-tournament' && t && !isFinished(t)) {
    if (
      window.confirm(
        'Завершить турнир? Таблица сохранится, правки счёта и новые круги будут закрыты. Потом можно открыть снова.',
      )
    ) {
      t.finishedAt = nowIso();
      store.ui.tab = 'table';
      setHash('table');
      closeScorePicker();
      store.ui.newPairsOpen = false;
      store.ui.rebuildOffer = null;
      touchTournament(t);
      scrollAfterPaint = 'final-standings';
      paint();
    }
    return;
  }
  if (action === 'reopen-tournament' && t && isFinished(t)) {
    t.finishedAt = null;
    touchTournament(t);
    paint();
    return;
  }
  if (action === 'gender' && t) {
    const p = findPlayer(btn.dataset.id);
    if (p) p.gender = btn.dataset.gender;
    touchTournament(t);
    paint();
    return;
  }
  if (action === 'remove-player' && t) {
    t.players = t.players.filter((p) => p.id !== btn.dataset.id);
    t.settings.courts = Math.max(1, autoCourts(t.players.length));
    touchTournament(t);
    paint();
    return;
  }
  if (action === 'gen-round') {
    generate(btn.dataset.kind);
    return;
  }
  if (action === 'rebuild-next') {
    rebuildNextRound();
    return;
  }
  if (action === 'rebuild-skip') {
    store.ui.rebuildOffer = null;
    paint();
    return;
  }
  if (action === 'toggle-bool' && t) {
    patchLiveSettings(t, { [btn.dataset.key]: btn.dataset.value === '1' });
    touchTournament(t);
    paint();
    return;
  }
  if (action === 'open-score-picker') {
    pickerTyping = false;
    store.ui.scorePicker = {
      round: Number(btn.dataset.round),
      court: Number(btn.dataset.court),
      game: Number(btn.dataset.game),
      side: btn.dataset.side,
    };
    paint();
    return;
  }
  if (action === 'confirm-score-picker') {
    closeScorePicker();
    paint();
    return;
  }
  if (action === 'draft-toggle-bool' && store.ui.draft) {
    store.ui.draft.settings[btn.dataset.key] = btn.dataset.value === '1';
    paint();
    return;
  }
  if (action === 'toggle-round') {
    const id = btn.dataset.id;
    const current = lastRound();
    if (current && current.id === id) return;
    const list = store.ui.expandedRoundIds || [];
    store.ui.expandedRoundIds = list.includes(id) ? list.filter((x) => x !== id) : list.concat(id);
    paint();
    return;
  }
  if (action === 'open-new-pairs') {
    store.ui.newPairsOpen = true;
    store.ui.discardUnfinished = false;
    paint();
    return;
  }
  if (action === 'close-new-pairs') {
    store.ui.newPairsOpen = false;
    paint();
    return;
  }
  if (action === 'new-pairs') {
    applyNewPairs(btn.dataset.method);
    return;
  }
  if (action === 'toggle-ui' && btn.matches('input[type="checkbox"]')) {
    return;
  }
  if (action === 'sort') {
    store.ui.sort = btn.dataset.sort;
    paint();
    return;
  }
  if (action === 'preset' && t) {
    patchLiveSettings(t, { pointsPreset: btn.dataset.n === 'custom' ? 'custom' : Number(btn.dataset.n) });
    touchTournament(t);
    paint();
    return;
  }
  if (action === 'draft-preset' && store.ui.draft) {
    store.ui.draft.settings.pointsPreset = btn.dataset.n === 'custom' ? 'custom' : Number(btn.dataset.n);
    paint();
    return;
  }
  if (action === 'qual-pts' && t) {
    patchLiveSettings(t, { qualifyingPoints: Number(btn.dataset.n) });
    touchTournament(t);
    paint();
    return;
  }
  if (action === 'draft-qual-pts' && store.ui.draft) {
    store.ui.draft.settings.qualifyingPoints = Number(btn.dataset.n);
    paint();
    return;
  }
  if (action === 'total-pts' && t) {
    patchLiveSettings(t, {
      scoringMode: 'total',
      totalPoints: btn.dataset.n === 'custom' ? 'custom' : Number(btn.dataset.n),
    });
    touchTournament(t);
    paint();
    return;
  }
  if (action === 'draft-total' && store.ui.draft) {
    store.ui.draft.settings.scoringMode = 'total';
    store.ui.draft.settings.totalPoints = btn.dataset.n === 'custom' ? 'custom' : Number(btn.dataset.n);
    store.ui.draft.settings.winByTwo = false;
    paint();
    return;
  }
  if (action === 'setting-val' && t) {
    patchLiveSettings(t, { [btn.dataset.key]: btn.dataset.value });
    touchTournament(t);
    paint();
    return;
  }
  if (action === 'draft-setting-val' && store.ui.draft) {
    const key = btn.dataset.key;
    const value = key === 'gamesToWin' ? Number(btn.dataset.value) : btn.dataset.value;
    patchSettings(store.ui.draft.settings, key, value);
    if (store.ui.draft.settings.scoringMode === 'games') store.ui.draft.settings.setScore = true;
    paint();
    return;
  }
}

function onChange(event) {
  const el = event.target;
  if (!(el instanceof HTMLElement)) return;
  const action = el.dataset.action;
  const t = tournament();
  if (action === 'rename' && el instanceof HTMLInputElement && t) {
    if (isFinished(t)) return;
    const p = findPlayer(el.dataset.id);
    if (p) p.name = el.value;
    touchTournament(t);
    persist();
    return;
  }
  if (action === 'tournament-name' && el instanceof HTMLInputElement && t) {
    if (isFinished(t)) return;
    t.name = el.value;
    touchTournament(t);
    persist();
    return;
  }
  if (action === 'draft-name' && el instanceof HTMLInputElement && store.ui.draft) {
    store.ui.draft.name = el.value;
    persist();
    return;
  }
  if (action === 'toggle' && el instanceof HTMLInputElement && t) {
    if (isFinished(t)) return;
    patchLiveSettings(t, { [el.dataset.key]: el.checked });
    touchTournament(t);
    paint();
    return;
  }
  if (action === 'draft-toggle' && el instanceof HTMLInputElement && store.ui.draft) {
    store.ui.draft.settings[el.dataset.key] = el.checked;
    paint();
    return;
  }
  if (action === 'toggle-ui' && el instanceof HTMLInputElement) {
    store.ui[el.dataset.key] = el.checked;
    persist();
    return;
  }
  if ((action === 'setting' || action === 'draft-setting') && el instanceof HTMLInputElement) {
    const key = el.dataset.key;
    const value = el.type === 'text' ? el.value : Number(el.value);
    if (action === 'draft-setting' && store.ui.draft?.settings) {
      store.ui.draft.settings[key] = key === 'scoringMode' ? el.value : value;
      paint();
      return;
    }
    if (t) {
      if (isFinished(t)) return;
      patchLiveSettings(t, { [key]: key === 'scoringMode' ? el.value : value });
      touchTournament(t);
      paint();
    }
  }
}

function onInput(event) {
  const el = event.target;
  if (!(el instanceof HTMLInputElement)) return;
  if (el.dataset.action === 'score') {
    setScore(Number(el.dataset.round), el.dataset.court, el.dataset.game, el.dataset.side, el.value, true, {
      skipPaint: pickerTyping,
    });
  }
}

function onSubmit(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  if (form.dataset.action === 'add-player-form') {
    event.preventDefault();
    const input = form.elements.namedItem('name');
    if (input instanceof HTMLInputElement) {
      addPlayer(input.value);
      input.value = '';
      input.focus();
    }
    return;
  }
  if (form.dataset.action === 'rename-tournament-form') {
    event.preventDefault();
    const input = form.elements.namedItem('name');
    const item = store.tournaments.find((x) => x.id === form.dataset.id);
    if (item && input instanceof HTMLInputElement && input.value.trim()) {
      item.name = input.value.trim();
      touchTournament(item);
    }
    store.ui.renameId = null;
    paint();
  }
}

function applyHash() {
  const tab = location.hash.replace('#', '');
  if (['players', 'play', 'table', 'settings'].includes(tab) && store.ui.activeId) {
    store.ui.screen = 'tournament';
    store.ui.tab = tab;
  }
}

root.addEventListener('click', onClick);
root.addEventListener('change', onChange);
root.addEventListener('input', onInput);
root.addEventListener('submit', onSubmit);
if (fileInput) fileInput.addEventListener('change', onImportFile);
window.addEventListener('hashchange', () => {
  applyHash();
  paint();
});

window.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (store.ui.scorePicker) {
    closeScorePicker();
    paint();
    return;
  }
  if (store.ui.backupOpen) {
    store.ui.backupOpen = false;
    paint();
  }
});

window.addEventListener('resize', syncChromeInsets);
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', syncChromeInsets);
}

applyHash();
paint();

window.padelTracker = {
  reset() {
    store = emptyStore();
    setHash('');
    paint();
  },
  patchActive(patch) {
    const t = tournament();
    if (!t || !patch || typeof patch !== 'object') return;
    Object.assign(t.settings, patch);
    touchTournament(t);
    paint();
  },
};
