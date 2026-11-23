import { generateRound, kingOfTheCourtGroups, genderCounts, autoCourts } from './pairing.js';
import {
  autoFillOther,
  applyTennisPoint,
  emptyGame,
  isGameComplete,
  matchComplete,
  neededGames,
} from './scoring.js';
import { computeStandings } from './standings.js';
import {
  activeTournament,
  applyImport,
  defaultSettingsFor,
  emptyStore,
  ensureMatchGames,
  loadState,
  newTournament,
  saveState,
  touchTournament,
} from './state.js';
import { formatTitle } from './formats.js';
import { renderApp } from './render.js';
import { buildExportPayload, downloadJson, exportFileName, parseImportJson } from './backup.js';

const root = document.getElementById('app');
const fileInput = document.getElementById('import-file');
let store = loadState();

function persist() {
  saveState(store);
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
  const active = document.activeElement;
  const id = active && active.id;
  const start = active && typeof active.selectionStart === 'number' ? active.selectionStart : null;
  const end = active && typeof active.selectionEnd === 'number' ? active.selectionEnd : null;
  renderApp(root, store);
  persist();
  if (id) {
    const el = document.getElementById(id);
    if (el && typeof el.focus === 'function') {
      el.focus();
      if (start != null && typeof el.setSelectionRange === 'function') {
        try {
          el.setSelectionRange(start, end ?? start);
        } catch {
          /* not a text input */
        }
      }
    }
  }
}

function findPlayer(id) {
  return tournament()?.players.find((p) => p.id === id);
}

function addPlayer(name) {
  const t = tournament();
  if (!t) return;
  const trimmed = name.trim();
  if (!trimmed) return;
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
  return Boolean(round && t && round.matches.every((m) => matchComplete(m, t.settings, round.kind)));
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

function generate(kind, method = null) {
  const t = tournament();
  if (!t) return;
  try {
    const { m, f } = genderCounts(t.players);
    if ((t.settings.pairType === 'mixed' || t.settings.formatVariant === 'mixed') && m !== f) {
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
      courtGroups = kingOfTheCourtGroups(last.matches, t.settings, last.kind);
    }
    const result = generateRound({
      players: t.players,
      settings: t.settings,
      standings,
      rounds: t.rounds,
      kind,
      courtGroups,
      method,
      fixedPairs: t.fixedPairs,
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
    };
    if (result.fixedPairs) t.fixedPairs = result.fixedPairs;
    t.settings.courts = Math.max(1, autoCourts(t.players.length));
    for (const match of round.matches) ensureMatchGames(match, t.settings, kind);
    t.nextRoundNum += 1;
    t.rounds.push(round);
    store.ui.tab = 'play';
    store.ui.newPairsOpen = false;
    touchTournament(t);
    if (result.warning) toast(result.warning);
    else paint();
  } catch (err) {
    toast(err instanceof Error ? err.message : 'Не удалось сгенерировать пары');
    paint();
  }
}

function applyNewPairs(method) {
  const last = lastRound();
  const complete = roundIsComplete(last);
  const hasScores = roundHasScores(last);
  if (last && !complete && hasScores) {
    resolveUnfinished({ discard: store.ui.discardUnfinished, replaceEmpty: false });
  } else if (last && !complete && !hasScores) {
    tournament()?.rounds.pop();
  }
  generate('regular', method);
}

let scorePaintTimer = 0;

function setScore(roundIndex, court, gameIndex, side, raw, target, winByTwo, fromUser) {
  const t = tournament();
  if (!t) return;
  const round = t.rounds[roundIndex];
  if (!round) return;
  const match = round.matches.find((m) => m.court === Number(court));
  if (!match) return;
  const beforeSlots = neededGames(t.settings, round.kind, match.games);
  ensureMatchGames(match, t.settings, round.kind);
  const game = match.games[Number(gameIndex)] || emptyGame();
  const parsed = raw === '' || raw == null ? null : Number.isFinite(Number(raw)) ? Number(raw) : null;
  game.touched = game.touched || { a: false, b: false };
  game.touched[side] = parsed != null;
  game[side] = parsed;
  let filledOther = null;
  if (fromUser) {
    const otherSide = side === 'a' ? 'b' : 'a';
    const other = autoFillOther(
      parsed,
      target === '' ? null : Number(target),
      winByTwo === '1' || winByTwo === true,
    );
    if (other != null && !game.touched[otherSide]) {
      game[otherSide] = other;
      filledOther = { otherSide, other };
    }
  }
  match.games[Number(gameIndex)] = game;
  ensureMatchGames(match, t.settings, round.kind);
  touchTournament(t);
  persist();
  if (filledOther) {
    const otherEl = document.getElementById(
      `score-r${roundIndex}-c${court}-g${gameIndex}-${filledOther.otherSide}`,
    );
    if (otherEl instanceof HTMLInputElement) otherEl.value = String(filledOther.other);
  }
  const afterSlots = neededGames(t.settings, round.kind, match.games);
  maybeOfferRebuild(roundIndex);
  window.clearTimeout(scorePaintTimer);
  if (afterSlots !== beforeSlots) {
    paint();
    return;
  }
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
      courtGroups = kingOfTheCourtGroups(prev.matches, t.settings, prev.kind);
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
    for (const match of round.matches) ensureMatchGames(match, t.settings, round.kind);
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
  store.ui.tab = t.rounds.length ? 'play' : 'players';
  store.ui.renameId = null;
  location.hash = store.ui.tab;
  paint();
}

function goHome() {
  store.ui.screen = 'home';
  store.ui.activeId = null;
  store.ui.tab = 'players';
  store.ui.draft = null;
  store.ui.newPairsOpen = false;
  store.ui.rebuildOffer = null;
  store.ui.renameId = null;
  location.hash = '';
  paint();
}

function startCreate() {
  store.ui.screen = 'create-format';
  store.ui.draft = null;
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
  location.hash = 'players';
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
        applyImport(store, tournaments, 'add');
        toast(`Добавлено: ${tournaments.length}`);
        paint();
        return;
      }
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
  const btn = event.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const t = tournament();
  if (action === 'tab') {
    store.ui.tab = btn.dataset.tab;
    location.hash = btn.dataset.tab;
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
  if (action === 'export-all') {
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
    location.hash = 'settings';
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
    t.settings[btn.dataset.key] = btn.dataset.value === '1';
    touchTournament(t);
    paint();
    return;
  }
  if (action === 'draft-toggle-bool' && store.ui.draft) {
    store.ui.draft.settings[btn.dataset.key] = btn.dataset.value === '1';
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
    t.settings.pointsPreset = btn.dataset.n === 'custom' ? 'custom' : Number(btn.dataset.n);
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
    t.settings.qualifyingPoints = Number(btn.dataset.n);
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
    t.settings.scoringMode = 'total';
    t.settings.totalPoints = btn.dataset.n === 'custom' ? 'custom' : Number(btn.dataset.n);
    t.settings.winByTwo = false;
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
    patchSettings(t.settings, btn.dataset.key, btn.dataset.value);
    touchTournament(t);
    paint();
    return;
  }
  if (action === 'draft-setting-val' && store.ui.draft) {
    patchSettings(store.ui.draft.settings, btn.dataset.key, btn.dataset.value);
    paint();
    return;
  }
  if (action === 'toggle-board') {
    const key = {
      round: Number(btn.dataset.round),
      court: Number(btn.dataset.court),
      game: Number(btn.dataset.game),
    };
    const cur = store.ui.scoreboard;
    store.ui.scoreboard =
      cur && cur.round === key.round && cur.court === key.court && cur.game === key.game ? null : key;
    paint();
    return;
  }
  if (action === 'tennis-point' && t) {
    const round = t.rounds[Number(btn.dataset.round)];
    const match = round?.matches.find((m) => m.court === Number(btn.dataset.court));
    const game = match?.games[Number(btn.dataset.game)];
    if (game) {
      const next = applyTennisPoint(game, btn.dataset.side);
      match.games[Number(btn.dataset.game)] = next;
      touchTournament(t);
      paint();
    }
  }
}

function onChange(event) {
  const el = event.target;
  if (!(el instanceof HTMLElement)) return;
  const action = el.dataset.action;
  const t = tournament();
  if (action === 'rename' && el instanceof HTMLInputElement && t) {
    const p = findPlayer(el.dataset.id);
    if (p) p.name = el.value;
    touchTournament(t);
    persist();
    return;
  }
  if (action === 'tournament-name' && el instanceof HTMLInputElement && t) {
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
    t.settings[el.dataset.key] = el.checked;
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
    const target = action === 'draft-setting' ? store.ui.draft?.settings : t?.settings;
    if (!target) return;
    const key = el.dataset.key;
    const value = el.type === 'text' ? el.value : Number(el.value);
    target[key] = key === 'scoringMode' ? el.value : value;
    if (t && action === 'setting') touchTournament(t);
    paint();
  }
}

function onInput(event) {
  const el = event.target;
  if (!(el instanceof HTMLInputElement)) return;
  if (el.dataset.action === 'score') {
    setScore(
      Number(el.dataset.round),
      el.dataset.court,
      el.dataset.game,
      el.dataset.side,
      el.value,
      el.dataset.target,
      el.dataset.winbytwo,
      true,
    );
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

applyHash();
paint();

window.padelTracker = {
  reset() {
    store = emptyStore();
    location.hash = '';
    paint();
  },
};
