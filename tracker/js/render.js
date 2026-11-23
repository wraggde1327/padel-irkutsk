import {
  gamesSum,
  gamesToWin,
  isGameComplete,
  matchComplete,
  neededGames,
  scoreWheelMax,
  settingsForRound,
  tennisLabel,
} from './scoring.js';
import { computeStandings, sortStandings } from './standings.js';
import { autoCourts, compactMatchLine, formatMatchLine, genderCounts } from './pairing.js';
import { FORMAT_OPTIONS, formatTitle } from './formats.js';
import { PAIR_CHANGE_METHODS } from './fixed.js';
import { activeTournament, ensureMatchGames } from './state.js';

export function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function ruGames(n) {
  const m = Math.abs(Number(n)) % 100;
  const d = m % 10;
  if (m > 10 && m < 20) return 'игр';
  if (d === 1) return 'игру';
  if (d >= 2 && d <= 4) return 'игры';
  return 'игр';
}

function ruCourts(n) {
  const v = Number(n);
  if (v === 1) return '1 корт';
  if (v >= 2 && v <= 4) return `${v} корта`;
  return `${v} кортов`;
}

function playerName(playersById, id) {
  return esc(playersById.get(id)?.name || id);
}

export function canPlayMixed(players) {
  const { m, f } = genderCounts(players);
  return m === f && m > 0;
}

export function scoringSummary(s) {
  if (s.scoringMode === 'games') {
    const n = gamesToWin(s);
    if (s.setScore || s.gamesToWin) {
      return `геймы до ${n}${s.decidingGame ? ', решающий' : ''}`;
    }
    return `теннис, ${s.gamesPerPairing} ${ruGames(s.gamesPerPairing)}${s.decidingGame ? ' + решающий' : ''}`;
  }
  if (s.scoringMode === 'total') {
    const n = s.totalPoints === 'custom' ? s.customTotal : s.totalPoints;
    return `сумма ${n}`;
  }
  const n = s.pointsPreset === 'custom' ? s.customPoints : s.pointsPreset;
  return `очки до ${n}${s.winByTwo ? ', ±2' : ''}`;
}

export function setupSummary(tournament) {
  const s = tournament.settings;
  const n = tournament.players.length;
  const courts = autoCourts(n);
  const sit = n % 4;
  const parts = [
    formatTitle(s.tournamentFormat),
    variantLabel(s),
    n >= 4 ? `${ruCourts(courts)}${sit ? `, ${sit} сидят` : ''}` : 'мало игроков',
    s.pairType === 'mixed' || s.formatVariant === 'mixed' ? 'М+Ж' : 'любые пары',
    s.tournamentFormat === 'free' ? (s.pairLock === 'unlocked' ? 'пары каждый круг' : 'пары закреплены') : null,
    s.standingsSort === 'wins' ? 'таблица по победам' : 'таблица по очкам',
    scoringSummary(s),
    s.tournamentFormat === 'free' && s.qualifyingEnabled ? 'есть квалификация' : null,
  ].filter(Boolean);
  return parts.join(' · ');
}

function variantLabel(s) {
  if (s.formatVariant === 'team') return 'парный';
  if (s.formatVariant === 'mixed') return 'смешанный';
  return null;
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      timeZone: 'Asia/Irkutsk',
      day: 'numeric',
      month: 'short',
    }).format(new Date(iso));
  } catch {
    return '';
  }
}

export function renderApp(root, store) {
  const screen = store.ui.screen || 'home';
  const tournament = activeTournament(store);
  const tab = store.ui.tab || 'players';
  const inTournament = screen === 'tournament' && tournament;
  root.innerHTML = `
    ${renderHeader(store, tournament, screen)}
    ${store.ui.toast ? `<div class="toast" role="status">${esc(store.ui.toast)}</div>` : ''}
    ${store.ui.importAsk ? renderImportAsk(store) : ''}
    <main class="main" id="main">${renderScreen(store, tournament, screen, tab)}</main>
    ${
      inTournament
        ? `<nav class="tabs tabs-3" aria-label="Разделы">
            ${tabBtn('players', 'Участники', tab)}
            ${tabBtn('play', 'Игры', tab)}
            ${tabBtn('table', 'Таблица', tab)}
          </nav>`
        : ''
    }
  `;
}

function renderHeader(store, tournament, screen) {
  if (screen === 'home') {
    return `<header class="top">
      <div>
        <p class="eyebrow">Падел · мини-турнир</p>
        <h1>Турниры</h1>
      </div>
    </header>`;
  }
  if (screen === 'create-format' || screen === 'create-settings') {
    return `<header class="top top-row">
      <button type="button" class="icon-btn back-btn" data-action="go-home" aria-label="Назад к списку">←</button>
      <div>
        <p class="eyebrow">Новый турнир</p>
        <h1>${screen === 'create-format' ? 'Формат' : 'Настройки'}</h1>
      </div>
    </header>`;
  }
  const name = tournament?.name || 'Турнир';
  return `<header class="top top-row">
    <button type="button" class="icon-btn back-btn" data-action="go-home" aria-label="К списку турниров">←</button>
    <div class="top-title">
      <p class="eyebrow">${esc(formatTitle(tournament?.settings.tournamentFormat))}</p>
      <h1>${esc(name)}</h1>
    </div>
  </header>`;
}

function tabBtn(id, label, current) {
  return `<button type="button" class="tab ${current === id ? 'is-on' : ''}" data-action="tab" data-tab="${id}" ${
    current === id ? 'aria-current="page"' : ''
  }>${label}</button>`;
}

function renderScreen(store, tournament, screen, tab) {
  if (screen === 'create-format') return renderCreateFormat(store);
  if (screen === 'create-settings') return renderCreateSettings(store);
  if (screen === 'tournament' && tournament) {
    if (tab === 'settings') return renderSettings(store, tournament);
    if (tab === 'play') return renderPlay(store, tournament);
    if (tab === 'table') return renderTable(store, tournament);
    return renderPlayers(store, tournament);
  }
  return renderHome(store);
}

function renderHome(store) {
  const items = store.tournaments
    .slice()
    .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)))
    .map((t) => {
      const n = t.players.length;
      const courts = autoCourts(n);
      const renaming = store.ui.renameId === t.id;
      return `
        <li class="home-item">
          ${
            renaming
              ? `<form class="rename-row" data-action="rename-tournament-form" data-id="${esc(t.id)}">
                  <input class="input" name="name" value="${esc(t.name)}" maxlength="60" required aria-label="Название" />
                  <button class="btn btn-primary" type="submit">OK</button>
                </form>`
              : `<button type="button" class="home-open" data-action="open-tournament" data-id="${esc(t.id)}">
                  <strong>${esc(t.name)}</strong>
                  <span>${esc(formatTitle(t.settings.tournamentFormat))} · ${n} игроков${
                    n >= 4 ? ` · ${ruCourts(courts)}` : ''
                  }${t.updatedAt ? ` · ${esc(formatDate(t.updatedAt))}` : ''}</span>
                </button>`
          }
          <div class="home-item-actions">
            <button type="button" class="btn btn-ghost" data-action="rename-tournament" data-id="${esc(t.id)}">Переименовать</button>
            <button type="button" class="btn btn-ghost" data-action="delete-tournament" data-id="${esc(t.id)}">Удалить</button>
          </div>
        </li>`;
    })
    .join('');
  return `
    <section class="stack">
      <div class="card">
        <p class="hint">Все турниры хранятся в этом браузере. Можно вести несколько сразу.</p>
        <ul class="home-list">${items || '<li class="empty">Пока нет турниров</li>'}</ul>
        <button type="button" class="btn btn-primary" id="btn-create" data-action="create" style="width:100%;margin-top:12px">Создать</button>
      </div>
      <div class="card">
        <h2>Файл</h2>
        <p class="hint">Скачайте JSON на телефон или восстановите из файла. Ничего не перезаписывается само.</p>
        <div class="actions">
          <button type="button" class="btn btn-ghost" data-action="export-all" ${
            store.tournaments.length ? '' : 'disabled'
          }>Экспорт всех</button>
          <button type="button" class="btn btn-ghost" data-action="import-file">Импорт из файла</button>
        </div>
      </div>
    </section>
  `;
}

function renderImportAsk(store) {
  const ask = store.ui.importAsk;
  const n = ask.tournaments.length;
  const inTournament = store.ui.screen === 'tournament' && store.ui.activeId;
  return `
    <div class="card callout" id="import-ask" role="dialog" aria-labelledby="import-ask-title">
      <h2 id="import-ask-title">Файл проверен</h2>
      <p>Найден${n === 1 ? '' : 'о'} ${n} ${n === 1 ? 'турнир' : 'турнира'}. Как импортировать?</p>
      <div class="actions">
        <button type="button" class="btn btn-primary" data-action="import-add">Добавить к списку</button>
        ${
          inTournament
            ? `<button type="button" class="btn btn-ghost" data-action="import-replace-one">Заменить этот турнир</button>`
            : ''
        }
        ${
          store.tournaments.length
            ? `<button type="button" class="btn btn-ghost" data-action="import-replace-all">Заменить все турниры</button>`
            : ''
        }
        <button type="button" class="btn btn-ghost" data-action="import-cancel">Отмена</button>
      </div>
    </div>`;
}

function renderCreateFormat() {
  return `
    <section class="card">
      <p class="hint">Сначала формат — настройки будут только для него.</p>
      <div class="format-list">
        ${FORMAT_OPTIONS.map(
          (f) => `
          <button type="button" class="format-opt" data-action="pick-format" data-format="${f.id}">
            <strong>${esc(f.title)}</strong>
            <span>${esc(f.hint)}</span>
          </button>`,
        ).join('')}
      </div>
    </section>`;
}

function renderCreateSettings(store) {
  const draft = store.ui.draft;
  if (!draft) return renderCreateFormat();
  const s = draft.settings;
  return `
    <section class="stack">
      <div class="card">
        <h2>${esc(formatTitle(draft.format))}</h2>
        <label class="field">Название
          <input class="input" data-action="draft-name" value="${esc(draft.name)}" maxlength="60" />
        </label>
        ${renderFormatSettings(s, { draft: true, players: [] })}
        <div class="actions wizard-nav">
          <button type="button" class="btn btn-ghost" data-action="create-back">Назад</button>
          <button type="button" class="btn btn-primary" id="btn-create-ok" data-action="create-ok">OK</button>
        </div>
      </div>
    </section>`;
}

function renderFormatSettings(s, { draft = false, players = [] } = {}) {
  const format = s.tournamentFormat || 'free';
  const action = draft ? 'draft-setting-val' : 'setting-val';
  const toggle = draft ? 'draft-toggle' : 'toggle';
  const toggleBool = draft ? 'draft-toggle-bool' : 'toggle-bool';
  const okMixed = players.length ? canPlayMixed(players) : true;
  if (format === 'free') {
    return `
      ${renderPairLock(s, action)}
      ${renderMixed(s, action, okMixed, players)}
      <p class="field-label">Таблица</p>
      <div class="seg">
        <button type="button" class="seg-btn ${s.standingsSort !== 'wins' ? 'is-on' : ''}" data-action="${action}" data-key="standingsSort" data-value="points">По очкам</button>
        <button type="button" class="seg-btn ${s.standingsSort === 'wins' ? 'is-on' : ''}" data-action="${action}" data-key="standingsSort" data-value="wins">По победам</button>
      </div>
      <h3>Счёт</h3>
      ${renderScoringFields(s, { lunda: false, draft })}
      <h3>Квалификация</h3>
      <p class="hint">Случайный круг до старта. Можно пропустить.</p>
      <div class="seg">
        <button type="button" class="seg-btn ${!s.qualifyingEnabled ? 'is-on' : ''}" data-action="${toggleBool}" data-key="qualifyingEnabled" data-value="0">Нет</button>
        <button type="button" class="seg-btn ${s.qualifyingEnabled ? 'is-on' : ''}" data-action="${toggleBool}" data-key="qualifyingEnabled" data-value="1">Да</button>
      </div>
      ${
        s.qualifyingEnabled
          ? `<div class="seg">
              <button type="button" class="seg-btn ${s.qualifyingPoints === 15 ? 'is-on' : ''}" data-action="${draft ? 'draft-qual-pts' : 'qual-pts'}" data-n="15">До 15</button>
              <button type="button" class="seg-btn ${s.qualifyingPoints === 17 ? 'is-on' : ''}" data-action="${draft ? 'draft-qual-pts' : 'qual-pts'}" data-n="17">До 17</button>
            </div>`
          : ''
      }`;
  }
  return `
    ${format === 'americano' || format === 'mexicano' ? renderVariant(s, action, format) : renderMixed(s, action, okMixed, players)}
    ${
      format === 'mexicano'
        ? `<p class="field-label">Пары в четвёрке</p>
    <div class="seg">
      <button type="button" class="seg-btn ${s.mexicanoPairing !== '1-3' ? 'is-on' : ''}" data-action="${action}" data-key="mexicanoPairing" data-value="1-4">1+4 vs 2+3</button>
      <button type="button" class="seg-btn ${s.mexicanoPairing === '1-3' ? 'is-on' : ''}" data-action="${action}" data-key="mexicanoPairing" data-value="1-3">1+3 vs 2+4</button>
    </div>`
        : ''
    }
    ${renderRoundsLimit(s, draft)}
    <h3>Счёт матча</h3>
    <p class="hint">Как в Lunda: игра до суммы очков, без разницы в 2.</p>
    ${renderScoringFields(s, { lunda: true, draft })}`;
}

function renderVariant(s, action, format) {
  return `
    <p class="field-label">Вид</p>
    <div class="format-list">
      <button type="button" class="format-opt ${s.formatVariant !== 'mixed' && s.formatVariant !== 'team' ? 'is-on' : ''}" data-action="${action}" data-key="formatVariant" data-value="classic">
        <strong>Классика</strong>
        <span>${format === 'mexicano' ? 'Группы по таблице после каждого круга.' : 'Каждый с каждым в напарниках.'}</span>
      </button>
      <button type="button" class="format-opt ${s.formatVariant === 'mixed' ? 'is-on' : ''}" data-action="${action}" data-key="formatVariant" data-value="mixed">
        <strong>Смешанный</strong>
        <span>Только пары М+Ж. Нужно поровну мужчин и женщин.</span>
      </button>
      <button type="button" class="format-opt ${s.formatVariant === 'team' ? 'is-on' : ''}" data-action="${action}" data-key="formatVariant" data-value="team">
        <strong>Парный</strong>
        <span>${format === 'mexicano' ? 'Закреплённые пары, соперники по силе (Team Mexicano).' : 'Закреплённые пары, круговой график соперников (Team Americano).'}</span>
      </button>
    </div>`;
}

function renderPairLock(s, action) {
  return `
    <p class="field-label">Пары</p>
    <div class="format-list">
      <button type="button" class="format-opt ${s.pairLock !== 'unlocked' ? 'is-on' : ''}" data-action="${action}" data-key="pairLock" data-value="locked">
        <strong>Закреплённые</strong>
        <span>Одни и те же пары, пока не нажмёте «Сменить пары». Соперники — ближайшие по силе.</span>
      </button>
      <button type="button" class="format-opt ${s.pairLock === 'unlocked' ? 'is-on' : ''}" data-action="${action}" data-key="pairLock" data-value="unlocked">
        <strong>Не закреплённые</strong>
        <span>Каждый круг заново: 1+последний (при М+Ж — сильный М со слабой Ж).</span>
      </button>
    </div>
    ${
      s.pairLock !== 'unlocked'
        ? `<div class="seg">
      <button type="button" class="seg-btn ${s.lockedMatchups !== 'roundrobin' ? 'is-on' : ''}" data-action="${action}" data-key="lockedMatchups" data-value="strength">Соперники по силе</button>
      <button type="button" class="seg-btn ${s.lockedMatchups === 'roundrobin' ? 'is-on' : ''}" data-action="${action}" data-key="lockedMatchups" data-value="roundrobin">Круговой график</button>
    </div>`
        : ''
    }`;
}

function renderMixed(s, action, okMixed, players) {
  const on = s.pairType === 'mixed' || s.formatVariant === 'mixed';
  if (players.length && !okMixed) {
    const { m, f } = genderCounts(players);
    return `<p class="hint">М+Ж выключено: нужно поровну (сейчас ${m} и ${f}).</p>`;
  }
  return `
    <p class="field-label">Играем М+Ж?</p>
    <div class="seg">
      <button type="button" class="seg-btn ${on ? 'is-on' : ''}" data-action="${action}" data-key="pairType" data-value="mixed">Да</button>
      <button type="button" class="seg-btn ${!on ? 'is-on' : ''}" data-action="${action}" data-key="pairType" data-value="any">Нет</button>
    </div>`;
}

function renderRoundsLimit(s, draft) {
  const action = draft ? 'draft-setting-val' : 'setting-val';
  const val = s.roundsLimit;
  const presets = ['full', '4', '6', '8'];
  return `
    <p class="field-label">Сколько кругов</p>
    <div class="seg wrap">
      ${presets
        .map((n) => {
          const on = String(val) === n || (n === 'full' && (val === 'full' || val == null));
          const label = n === 'full' ? 'По циклу' : n;
          return `<button type="button" class="seg-btn ${on ? 'is-on' : ''}" data-action="${action}" data-key="roundsLimit" data-value="${n}">${label}</button>`;
        })
        .join('')}
    </div>
    <p class="hint">Корты считаются сами: игроков ÷ 4. Лишние сидят по очереди.</p>`;
}

function renderTotalPointsFields(s, { draft = false } = {}) {
  const total = draft ? 'draft-total' : 'total-pts';
  const n = s.totalPoints;
  return `
    <p class="field-label">Сумма очков</p>
    <div class="seg wrap">
      ${[16, 21, 24, 32]
        .map(
          (v) =>
            `<button type="button" class="seg-btn ${Number(n) === v ? 'is-on' : ''}" data-action="${total}" data-n="${v}">${v}</button>`,
        )
        .join('')}
      <button type="button" class="seg-btn ${n === 'custom' ? 'is-on' : ''}" data-action="${total}" data-n="custom">Своё</button>
    </div>
    ${
      n === 'custom'
        ? `<label class="field">Сумма очков
            <input class="input" type="number" min="8" max="99" data-action="${draft ? 'draft-setting' : 'setting'}" data-key="customTotal" value="${esc(s.customTotal)}" />
          </label>`
        : ''
    }`;
}

function renderPointsFields(s, { draft = false } = {}) {
  const toggle = draft ? 'draft-toggle' : 'toggle';
  const preset = draft ? 'draft-preset' : 'preset';
  return `
    <p class="field-label">До скольких</p>
    <div class="seg wrap">
      ${[11, 15, 21].map((n) => `<button type="button" class="seg-btn ${s.pointsPreset === n ? 'is-on' : ''}" data-action="${preset}" data-n="${n}">${n}</button>`).join('')}
      <button type="button" class="seg-btn ${s.pointsPreset === 'custom' ? 'is-on' : ''}" data-action="${preset}" data-n="custom">Своё</button>
    </div>
    ${
      s.pointsPreset === 'custom'
        ? `<label class="field">Своё N
            <input class="input" type="number" min="3" max="99" data-action="${draft ? 'draft-setting' : 'setting'}" data-key="customPoints" value="${esc(s.customPoints)}" />
          </label>`
        : ''
    }
    <label class="toggle">
      <input type="checkbox" data-action="${toggle}" data-key="winByTwo" ${s.winByTwo ? 'checked' : ''} />
      <span>Победа с разницей в 2</span>
    </label>`;
}

function renderGamesFields(s, { draft = false } = {}) {
  const action = draft ? 'draft-setting-val' : 'setting-val';
  const toggle = draft ? 'draft-toggle' : 'toggle';
  const n = gamesToWin(s);
  return `
    <p class="field-label">Геймов до победы</p>
    <div class="seg wrap">
      ${[4, 6, 7]
        .map(
          (v) =>
            `<button type="button" class="seg-btn ${n === v ? 'is-on' : ''}" data-action="${action}" data-key="gamesToWin" data-value="${v}">${v}</button>`,
        )
        .join('')}
    </div>
    <label class="toggle">
      <input type="checkbox" data-action="${toggle}" data-key="decidingGame" ${s.decidingGame ? 'checked' : ''} />
      <span>Решающий при ${n - 1}:${n - 1}</span>
    </label>
    <p class="hint">${s.decidingGame ? `Максимум ${n}:${n - 1}. Например ${n}:${Math.max(0, n - 1)}.` : `Максимум ${n}:${Math.max(0, n - 2)}, без тай-брейка.`}</p>`;
}

export function renderScoringFields(s, { lunda = false, draft = false } = {}) {
  const action = draft ? 'draft-setting-val' : 'setting-val';
  const mode = s.scoringMode;
  if (draft && lunda) {
    return renderTotalPointsFields(s, { draft });
  }
  const showTotal = !draft || lunda;
  const pointsOn = mode === 'points' || (mode !== 'games' && mode !== 'total');
  const gamesOn = mode === 'games';
  const totalOn = mode === 'total';
  return `
    <div class="seg wrap">
      <button type="button" class="seg-btn ${pointsOn ? 'is-on' : ''}" data-action="${action}" data-key="scoringMode" data-value="points">По очкам</button>
      <button type="button" class="seg-btn ${gamesOn ? 'is-on' : ''}" data-action="${action}" data-key="scoringMode" data-value="games">Геймы</button>
      ${
        showTotal
          ? `<button type="button" class="seg-btn ${totalOn ? 'is-on' : ''}" data-action="${action}" data-key="scoringMode" data-value="total">Сумма</button>`
          : ''
      }
    </div>
    ${gamesOn ? renderGamesFields(s, { draft }) : totalOn ? renderTotalPointsFields(s, { draft }) : renderPointsFields(s, { draft })}`;
}

function rosterHint(players) {
  const n = players.length;
  const courts = autoCourts(n);
  const sit = n % 4;
  if (n < 4) return `${n} игроков · нужно минимум 4`;
  if (sit) return `${n} игроков · ${ruCourts(courts)} · ${sit} сидят по очереди`;
  return `${n} игроков · ${ruCourts(courts)}`;
}

function renderPlayers(store, tournament) {
  const { players } = tournament;
  const rows = players
    .map(
      (p) => `
      <li class="player-row" data-id="${esc(p.id)}">
        <input class="input name-input" data-action="rename" data-id="${esc(p.id)}" value="${esc(p.name)}" maxlength="40" aria-label="Имя" />
        <div class="seg" role="group" aria-label="Пол">
          <button type="button" class="seg-btn ${p.gender === 'M' ? 'is-on' : ''}" data-action="gender" data-id="${esc(p.id)}" data-gender="M">М</button>
          <button type="button" class="seg-btn ${p.gender === 'F' ? 'is-on' : ''}" data-action="gender" data-id="${esc(p.id)}" data-gender="F">Ж</button>
        </div>
        <button type="button" class="icon-btn" data-action="remove-player" data-id="${esc(p.id)}" aria-label="Удалить">×</button>
      </li>`,
    )
    .join('');
  const ready = players.length >= 4;
  return `
    <section class="card">
      <h2>Участники</h2>
      <p class="hint">${esc(rosterHint(players))}</p>
      <ul class="player-list">${rows || '<li class="empty">Пока никого нет</li>'}</ul>
      <form class="add-row" data-action="add-player-form">
        <input class="input" id="add-name" name="name" placeholder="Имя игрока" maxlength="40" autocomplete="off" required />
        <button class="btn btn-primary" type="submit">Добавить</button>
      </form>
      ${
        ready
          ? `<button type="button" class="btn btn-primary" data-action="tab" data-tab="play" style="width:100%;margin-top:12px">К играм</button>`
          : ''
      }
    </section>
  `;
}

function renderPlay(store, tournament) {
  const playersById = new Map(tournament.players.map((p) => [p.id, p]));
  if (tournament.players.length < 4) {
    return `
      <section class="card">
        <h2>Игры</h2>
        <p class="hint">Добавьте минимум 4 игроков на вкладке «Участники» (сейчас ${tournament.players.length}). Корты посчитаются сами.</p>
      </section>`;
  }

  const last = tournament.rounds[tournament.rounds.length - 1];
  const lastSettings = last ? settingsForRound(last, tournament.settings) : tournament.settings;
  const lastDone = last && last.matches.every((m) => matchComplete(m, lastSettings, last.kind));
  const canQual =
    tournament.settings.qualifyingEnabled && !tournament.rounds.some((r) => r.kind === 'qualifying');
  const format = tournament.settings.tournamentFormat || 'free';
  const nextLabel =
    format === 'king'
      ? 'Сдвиг короля'
      : format === 'escalera'
        ? 'Смена кортов'
        : format === 'mexicano'
          ? 'Следующий круг по таблице'
          : last
            ? 'Следующий круг'
            : 'Начать круг';

  const actions = [];
  if (canQual && (!last || lastDone)) {
    actions.push(
      `<button type="button" class="btn btn-ghost" data-action="gen-round" data-kind="qualifying">Квалификация</button>`,
    );
  }
  if (!last || lastDone) {
    actions.push(
      `<button type="button" class="btn btn-primary" id="btn-next-round" data-action="gen-round" data-kind="regular">${nextLabel}</button>`,
    );
  }
  if (format === 'free') {
    actions.push(
      `<button type="button" class="btn btn-ghost" data-action="open-new-pairs" id="btn-change-pairs">Сменить пары</button>`,
    );
  }

  const history = tournament.rounds
    .map((round, index) =>
      renderRound(store, tournament, round, index, playersById, index === tournament.rounds.length - 1),
    )
    .reverse()
    .join('');

  return `
    <section class="stack">
      <p class="summary-line">
        <span>${esc(setupSummary(tournament))}</span>
        <button type="button" class="linkish summary-edit" data-action="open-settings">Настройки турнира</button>
      </p>
      ${
        actions.length
          ? `<div class="card play-bar">
        <div class="actions">${actions.join('')}</div>
      </div>`
          : ''
      }
      ${store.ui.rebuildOffer != null ? renderRebuildOffer() : ''}
      ${store.ui.newPairsOpen ? renderChangePairsPanel(store, last, lastDone) : ''}
      ${history || '<div class="card"><p class="hint">Кругов ещё нет — нажмите «Начать круг».</p></div>'}
    </section>
  `;
}

function renderRebuildOffer() {
  return `
    <div class="card callout" id="rebuild-offer">
      <p>Счёт прошлого круга изменился, а следующий ещё без очков.</p>
      <div class="actions">
        <button type="button" class="btn btn-primary" data-action="rebuild-next">Пересобрать следующий круг</button>
        <button type="button" class="btn btn-ghost" data-action="rebuild-skip">Оставить как есть</button>
      </div>
    </div>`;
}

function renderChangePairsPanel(store, last, lastDone) {
  const hasScores =
    last &&
    last.matches.some((m) =>
      (m.games || []).some((g) => g && ((g.a != null && g.a !== '') || (g.b != null && g.b !== ''))),
    );
  const partial = last && !lastDone && hasScores;
  const methods = PAIR_CHANGE_METHODS.map(
    (m) => `
      <button type="button" class="format-opt" data-action="new-pairs" data-method="${m.id}">
        <strong>${esc(m.title)}</strong>
        <span>${esc(m.hint)}</span>
      </button>`,
  ).join('');
  return `
    <div class="card sheet" id="new-pairs">
      <h2>Сменить пары</h2>
      <p class="hint">Новые пары начнут свои матчи с этого круга. Формат турнира не меняется.</p>
      ${
        partial
          ? `<div class="callout">
              <p>В круге уже есть счета, но не все матчи доиграны.</p>
              <p class="hint">По умолчанию сыгранное останется в таблице, незаполненное не считается.</p>
              <label class="toggle">
                <input type="checkbox" data-action="toggle-ui" data-key="discardUnfinished" ${store.ui.discardUnfinished ? 'checked' : ''} />
                <span>Удалить этот круг целиком</span>
              </label>
            </div>`
          : last && !lastDone
            ? '<p class="hint">Текущий круг без счетов заменится.</p>'
            : '<p class="hint">Добавится новый круг с новыми парами.</p>'
      }
      <div class="format-list">${methods}</div>
      <button type="button" class="btn btn-ghost" data-action="close-new-pairs">Отмена</button>
    </div>
  `;
}

function roundTitle(round, index) {
  if (round.kind === 'qualifying') return 'Квалификация';
  const n = round.number || index;
  const fmt = round.format && round.format !== 'free' && round.format !== 'qualifying' ? ` · ${formatTitle(round.format)}` : '';
  const early = round.closedEarly ? ' · закрыт досрочно' : '';
  return `Круг ${n}${fmt}${early}`;
}

function compactRoundLine(round, playersById) {
  return round.matches
    .slice()
    .sort((a, b) => a.court - b.court || (a.sequence || 0) - (b.sequence || 0))
    .map((m) => {
      const games = (m.games || []).filter(isGameComplete);
      const sum = gamesSum(games);
      const score = games.length ? `${sum.a}:${sum.b}` : '';
      return compactMatchLine(m, playersById, score);
    })
    .join(' · ');
}

function isRoundExpanded(store, round, isCurrent) {
  if (isCurrent) return true;
  return (store.ui.expandedRoundIds || []).includes(round.id);
}

function renderRound(store, tournament, round, index, playersById, isCurrent) {
  const expanded = isRoundExpanded(store, round, isCurrent);
  const title = roundTitle(round, index);
  const summary = compactRoundLine(round, playersById);
  const cards = expanded
    ? round.matches
        .slice()
        .sort((a, b) => a.court - b.court)
        .map((match) => renderMatch(store, tournament, round, index, match, playersById, expanded))
        .join('')
    : '';
  const head = isCurrent
    ? `<h3>${esc(title)}</h3>`
    : `<button type="button" class="round-toggle" data-action="toggle-round" data-id="${esc(round.id)}" aria-expanded="${expanded ? 'true' : 'false'}">
        <h3>${esc(title)}</h3>
        ${
          expanded
            ? '<span class="round-toggle-hint">Свернуть</span>'
            : `<span class="round-summary-line">${esc(summary)}</span>`
        }
      </button>`;
  return `
    <article class="card round ${isCurrent ? 'is-current' : ''} ${expanded ? '' : 'is-collapsed'}" data-round-id="${esc(round.id)}">
      ${head}
      ${expanded && round.note ? `<p class="move-note">${esc(round.note)}</p>` : ''}
      ${cards}
    </article>
  `;
}

function teamNamesBlock(playersById, ids) {
  return `<p class="team-names"><span>${playerName(playersById, ids[0])}</span><span>${playerName(playersById, ids[1])}</span></p>`;
}

function renderMatch(store, tournament, round, roundIndex, match, playersById, expanded) {
  const settings = settingsForRound(round, tournament.settings);
  ensureMatchGames(match, settings, round.kind);
  const n = neededGames(settings, round.kind, match.games);
  const games = match.games.slice(0, n);
  const sum = gamesSum(games.filter(isGameComplete));
  const showTennis = settings.scoringMode === 'games' && round.kind !== 'qualifying';
  const aLabel = `${playersById.get(match.teamA[0])?.name || match.teamA[0]} / ${playersById.get(match.teamA[1])?.name || match.teamA[1]}`;
  const bLabel = `${playersById.get(match.teamB[0])?.name || match.teamB[0]} / ${playersById.get(match.teamB[1])?.name || match.teamB[1]}`;
  const typed = store.ui.typedScoreKeys || [];
  const aScores = games
    .map((g, gi) => {
      const label =
        n === 1
          ? ''
          : `Гейм ${gi + 1}${gi === n - 1 && n > (round.kind === 'qualifying' ? 1 : settings.gamesPerPairing) ? ' · решающий' : ''}`;
      return `${label ? `<span class="score-label">${label}</span>` : ''}${scorePicker(roundIndex, match.court, gi, 'a', g.a, settings, round.kind, aLabel, typed)}`;
    })
    .join('');
  const bScores = games
    .map((g, gi) => {
      const label =
        n === 1
          ? ''
          : `Гейм ${gi + 1}${gi === n - 1 && n > (round.kind === 'qualifying' ? 1 : settings.gamesPerPairing) ? ' · решающий' : ''}`;
      return `${label ? `<span class="score-label">${label}</span>` : ''}${scorePicker(roundIndex, match.court, gi, 'b', g.b, settings, round.kind, bLabel, typed)}`;
    })
    .join('');
  const boards = showTennis
    ? games.map((g, gi) => renderScoreboard(store, roundIndex, match.court, gi, g)).join('')
    : '';
  return `
    <div class="match">
      <div class="match-head">
        <span class="badge">Корт ${match.court}${match.sequence ? ` · смена ${match.sequence}` : ''}</span>
        ${isGameComplete({ a: sum.a, b: sum.b }) && games.some(isGameComplete) ? `<span class="sum">${sum.a} — ${sum.b}</span>` : ''}
      </div>
      <div class="match-duel">
        <div class="match-side">
          ${teamNamesBlock(playersById, match.teamA)}
          ${aScores}
        </div>
        <div class="match-mid" aria-hidden="true"></div>
        <div class="match-side">
          ${teamNamesBlock(playersById, match.teamB)}
          ${bScores}
        </div>
      </div>
      ${boards}
    </div>
  `;
}

function scorePicker(roundIndex, court, gameIndex, side, value, settings, roundKind, teamLabelText, typedKeys) {
  const shown = value == null || value === '' ? '' : String(value);
  const id = `score-r${roundIndex}-c${court}-g${gameIndex}-${side}`;
  const typeMode = typedKeys.includes(id);
  const max = scoreWheelMax(settings, roundKind);
  const aria = teamLabelText ? `Счёт, ${teamLabelText}` : 'Счёт';
  const items = ['']
    .concat(Array.from({ length: max + 1 }, (_, n) => n))
    .map((n) => {
      const key = n === '' ? '' : String(n);
      const on = shown === key;
      return `<button type="button" class="wheel-item${on ? ' is-on' : ''}" data-action="score-wheel" data-n="${esc(key)}"
        data-round="${roundIndex}" data-court="${court}" data-game="${gameIndex}" data-side="${side}"
        role="option" aria-selected="${on ? 'true' : 'false'}">${n === '' ? '—' : n}</button>`;
    })
    .join('');
  return `
    <div class="score-picker${typeMode ? ' is-type' : ''}">
      <div class="wheel-wrap${typeMode ? ' is-hidden' : ''}">
        <div class="wheel" data-wheel data-round="${roundIndex}" data-court="${court}" data-game="${gameIndex}" data-side="${side}"
          data-value="${esc(shown)}" role="listbox" aria-label="${esc(aria)}" tabindex="0">
          <div class="wheel-pad" aria-hidden="true"></div>
          ${items}
          <div class="wheel-pad" aria-hidden="true"></div>
        </div>
        <div class="wheel-frame" aria-hidden="true"></div>
      </div>
      <input class="input score${typeMode ? '' : ' is-visually-hidden'}" inputmode="numeric" pattern="[0-9]*" type="text" maxlength="3"
        data-action="score"
        data-round="${roundIndex}" data-court="${court}" data-game="${gameIndex}" data-side="${side}"
        id="${id}"
        value="${esc(shown)}" aria-label="${esc(aria)}" ${typeMode ? '' : 'tabindex="-1"'} />
      <button type="button" class="wheel-type-btn" data-action="score-type" data-id="${esc(id)}" data-mode="${typeMode ? 'type' : 'wheel'}">
        ${typeMode ? 'Крутилка' : 'Клавиатура'}
      </button>
    </div>`;
}

function renderScoreboard(store, roundIndex, court, gameIndex, game) {
  const tennis = game.tennis || { ptsA: 0, ptsB: 0 };
  const labels = tennisLabel(tennis.ptsA, tennis.ptsB);
  const open =
    store.ui.scoreboard &&
    store.ui.scoreboard.round === roundIndex &&
    store.ui.scoreboard.court === court &&
    store.ui.scoreboard.game === gameIndex;
  return `
    <button type="button" class="linkish" data-action="toggle-board" data-round="${roundIndex}" data-court="${court}" data-game="${gameIndex}">
      ${open ? 'Скрыть табло' : 'Табло по очкам'}
    </button>
    ${
      open
        ? `<div class="board">
            <p class="hint">${labels.golden ? 'Золотое очко' : '15–30–40, при 40–40 — золотое'}</p>
            <div class="board-row">
              <button type="button" class="btn btn-ghost" data-action="tennis-point" data-round="${roundIndex}" data-court="${court}" data-game="${gameIndex}" data-side="a">Очко слева</button>
              <strong>${labels.a} : ${labels.b}</strong>
              <button type="button" class="btn btn-ghost" data-action="tennis-point" data-round="${roundIndex}" data-court="${court}" data-game="${gameIndex}" data-side="b">Очко справа</button>
            </div>
          </div>`
        : ''
    }
  `;
}

function renderTable(store, tournament) {
  const primary = tournament.settings.standingsSort === 'wins' ? 'wins' : 'points';
  const sort = store.ui.sort || primary;
  const rows = sortStandings(
    computeStandings(tournament.players, tournament.rounds, tournament.settings),
    sort,
  );
  const playersById = new Map(tournament.players.map((p) => [p.id, p]));
  const body = rows
    .map(
      (r, i) => `
      <tr>
        <td class="num">${i + 1}</td>
        <td class="name">${esc(r.name)}</td>
        <td>${r.wins}</td>
        <td>${r.losses}</td>
        <td>${r.pointsFor}–${r.pointsAgainst}</td>
        <td class="${r.delta > 0 ? 'pos' : r.delta < 0 ? 'neg' : ''}">${r.delta > 0 ? '+' : ''}${r.delta}</td>
      </tr>`,
    )
    .join('');
  const history = tournament.rounds
    .map((round, index) => {
      const lines = round.matches
        .slice()
        .sort((a, b) => a.court - b.court)
        .map((m) => {
          const sum = gamesSum((m.games || []).filter(isGameComplete));
          const score = m.games?.some(isGameComplete) ? ` · ${sum.a}:${sum.b}` : '';
          return `<p class="court-line">${esc(formatMatchLine(m, playersById))}${esc(score)}</p>`;
        })
        .join('');
      return `<div class="hist-block"><h4>${esc(roundTitle(round, index))}</h4>${lines}</div>`;
    })
    .join('');
  return `
    <section class="stack">
      <div class="card">
        <h2>Таблица</h2>
        <div class="seg sort-seg" role="group" aria-label="Сортировка">
          <button type="button" class="seg-btn ${sort === 'points' ? 'is-on' : ''}" data-action="sort" data-sort="points">Очки</button>
          <button type="button" class="seg-btn ${sort === 'wins' ? 'is-on' : ''}" data-action="sort" data-sort="wins">Победы</button>
          <button type="button" class="seg-btn ${sort === 'delta' ? 'is-on' : ''}" data-action="sort" data-sort="delta">Разница</button>
        </div>
        <div class="table-wrap">
          <table class="standings">
            <thead>
              <tr>
                <th>#</th>
                <th>Игрок</th>
                <th>В</th>
                <th>П</th>
                <th>Очки</th>
                <th>Δ</th>
              </tr>
            </thead>
            <tbody>${body || '<tr><td colspan="6" class="empty">Нет результатов</td></tr>'}</tbody>
          </table>
        </div>
      </div>
      <div class="card">
        <h3>История кругов</h3>
        ${history || '<p class="hint">Пока пусто</p>'}
      </div>
    </section>
  `;
}

function renderSettings(store, tournament) {
  const s = tournament.settings;
  return `
    <section class="stack">
      <div class="card">
        <h2>Настройки турнира</h2>
        <label class="field">Название
          <input class="input" data-action="tournament-name" value="${esc(tournament.name)}" maxlength="60" />
        </label>
        <p class="hint">${esc(setupSummary(tournament))}</p>
        ${renderFormatSettings(s, { draft: false, players: tournament.players })}
      </div>
      <div class="card">
        <h2>Файл этого турнира</h2>
        <p class="hint">Экспорт только его. Импорт — добавить как новый или заменить этот, не молча.</p>
        <div class="actions">
          <button type="button" class="btn btn-ghost" data-action="export-one">Экспорт этого</button>
          <button type="button" class="btn btn-ghost" data-action="import-file">Импорт из файла</button>
        </div>
      </div>
      <div class="card">
        <button type="button" class="btn btn-ghost" data-action="tab" data-tab="play" style="width:100%">К играм</button>
      </div>
    </section>
  `;
}
