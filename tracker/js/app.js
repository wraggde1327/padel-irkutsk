import { generateRound, kingOfTheCourtGroups, expectedPlayerCount } from './pairing.js';
import { autoFillOther, applyTennisPoint, emptyGame, matchComplete, neededGames } from './scoring.js';
import { computeStandings } from './standings.js';
import { clearState, emptyState, ensureMatchGames, loadState, saveState } from './state.js';
import { renderApp } from './render.js';

const root = document.getElementById('app');
let state = loadState();

function persist() {
  saveState(state);
}

function toast(message) {
  state.ui.toast = message;
  paint();
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => {
    if (state.ui.toast === message) {
      state.ui.toast = '';
      paint();
    }
  }, 3200);
}

function paint() {
  const active = document.activeElement;
  const id = active && active.id;
  const start = active && typeof active.selectionStart === 'number' ? active.selectionStart : null;
  const end = active && typeof active.selectionEnd === 'number' ? active.selectionEnd : null;
  renderApp(root, state);
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
  return state.players.find((p) => p.id === id);
}

function addPlayer(name) {
  const trimmed = name.trim();
  if (!trimmed) return;
  const need = expectedPlayerCount(state.settings.courts);
  if (state.players.length >= need) {
    toast(`Уже ${need} игроков — больше не нужно.`);
    return;
  }
  const gender = state.players.length % 2 === 0 ? 'M' : 'F';
  state.players.push({
    id: `p${state.nextPlayerNum++}`,
    name: trimmed,
    gender,
  });
  paint();
}

function generate(kind) {
  try {
    const standings = computeStandings(state.players, state.rounds, state.settings);
    const last = state.rounds[state.rounds.length - 1];
    let courtGroups = null;
    if (
      kind === 'regular' &&
      state.settings.kingOfTheCourt &&
      last &&
      last.matches.every((m) => matchComplete(m, state.settings, last.kind))
    ) {
      courtGroups = kingOfTheCourtGroups(last.matches, state.settings, last.kind);
    }
    const { matches, warning } = generateRound({
      players: state.players,
      settings: state.settings,
      standings,
      rounds: state.rounds,
      kind,
      courtGroups,
    });
    const round = {
      id: `r${state.nextRoundNum}`,
      number: kind === 'qualifying' ? 0 : state.rounds.filter((r) => r.kind === 'regular').length + 1,
      kind,
      matches,
    };
    for (const match of round.matches) ensureMatchGames(match, state.settings, kind);
    state.nextRoundNum += 1;
    state.rounds.push(round);
    state.ui.tab = 'play';
    if (warning) toast(warning);
    paint();
  } catch (err) {
    toast(err instanceof Error ? err.message : 'Не удалось сгенерировать пары');
    paint();
  }
}

function regenLast() {
  const last = state.rounds[state.rounds.length - 1];
  if (!last) return;
  if (last.matches.some((m) => (m.games || []).some((g) => g.a != null && g.a !== ''))) {
    toast('Сначала очистите счёт, если хотите новые пары.');
    return;
  }
  state.rounds.pop();
  generate(last.kind);
}

let scorePaintTimer = 0;

function setScore(roundIndex, court, gameIndex, side, raw, target, winByTwo, fromUser) {
  const round = state.rounds[roundIndex];
  if (!round) return;
  const match = round.matches.find((m) => m.court === Number(court));
  if (!match) return;
  const beforeSlots = neededGames(state.settings, round.kind, match.games);
  ensureMatchGames(match, state.settings, round.kind);
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
  ensureMatchGames(match, state.settings, round.kind);
  persist();
  if (filledOther) {
    const otherEl = document.getElementById(
      `score-r${roundIndex}-c${court}-g${gameIndex}-${filledOther.otherSide}`,
    );
    if (otherEl instanceof HTMLInputElement) otherEl.value = String(filledOther.other);
  }
  const afterSlots = neededGames(state.settings, round.kind, match.games);
  window.clearTimeout(scorePaintTimer);
  if (afterSlots !== beforeSlots) {
    paint();
    return;
  }
  scorePaintTimer = window.setTimeout(() => paint(), 180);
}

function onClick(event) {
  const btn = event.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  if (action === 'tab') {
    state.ui.tab = btn.dataset.tab;
    location.hash = btn.dataset.tab;
    paint();
    return;
  }
  if (action === 'gender') {
    const p = findPlayer(btn.dataset.id);
    if (p) p.gender = btn.dataset.gender;
    paint();
    return;
  }
  if (action === 'remove-player') {
    state.players = state.players.filter((p) => p.id !== btn.dataset.id);
    paint();
    return;
  }
  if (action === 'gen-round') {
    generate(btn.dataset.kind);
    return;
  }
  if (action === 'regen-round') {
    regenLast();
    return;
  }
  if (action === 'sort') {
    state.ui.sort = btn.dataset.sort;
    paint();
    return;
  }
  if (action === 'preset') {
    state.settings.pointsPreset = btn.dataset.n === 'custom' ? 'custom' : Number(btn.dataset.n);
    paint();
    return;
  }
  if (action === 'qual-pts') {
    state.settings.qualifyingPoints = Number(btn.dataset.n);
    paint();
    return;
  }
  if (action === 'courts') {
    state.settings.courts = Number(btn.dataset.n);
    paint();
    return;
  }
  if (action === 'setting-val') {
    state.settings[btn.dataset.key] = btn.dataset.value;
    paint();
    return;
  }
  if (action === 'toggle-board') {
    const key = {
      round: Number(btn.dataset.round),
      court: Number(btn.dataset.court),
      game: Number(btn.dataset.game),
    };
    const cur = state.ui.scoreboard;
    state.ui.scoreboard =
      cur && cur.round === key.round && cur.court === key.court && cur.game === key.game ? null : key;
    paint();
    return;
  }
  if (action === 'tennis-point') {
    const round = state.rounds[Number(btn.dataset.round)];
    const match = round?.matches.find((m) => m.court === Number(btn.dataset.court));
    const game = match?.games[Number(btn.dataset.game)];
    if (game) {
      const next = applyTennisPoint(game, btn.dataset.side);
      match.games[Number(btn.dataset.game)] = next;
      paint();
    }
    return;
  }
  if (action === 'reset') {
    if (window.confirm('Сбросить все данные и начать заново? Это нельзя отменить.')) {
      state = clearState();
      location.hash = 'players';
      paint();
    }
  }
}

function onChange(event) {
  const el = event.target;
  if (!(el instanceof HTMLElement)) return;
  const action = el.dataset.action;
  if (action === 'rename' && el instanceof HTMLInputElement) {
    const p = findPlayer(el.dataset.id);
    if (p) p.name = el.value;
    persist();
    return;
  }
  if (action === 'toggle' && el instanceof HTMLInputElement) {
    state.settings[el.dataset.key] = el.checked;
    paint();
    return;
  }
  if (action === 'setting') {
    const key = el.dataset.key;
    const value = el instanceof HTMLSelectElement || el.type === 'text' ? el.value : Number(el.value);
    state.settings[key] = key === 'scoringMode' ? el.value : value;
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
  if (form.dataset.action !== 'add-player-form') return;
  event.preventDefault();
  const input = form.elements.namedItem('name');
  if (input instanceof HTMLInputElement) {
    addPlayer(input.value);
    input.value = '';
    input.focus();
  }
}

function applyHash() {
  const tab = location.hash.replace('#', '');
  if (['players', 'play', 'table', 'settings'].includes(tab)) {
    state.ui.tab = tab;
  }
}

root.addEventListener('click', onClick);
root.addEventListener('change', onChange);
root.addEventListener('input', onInput);
root.addEventListener('submit', onSubmit);
window.addEventListener('hashchange', () => {
  applyHash();
  paint();
});

applyHash();
paint();
