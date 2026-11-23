import {
  gamesSum,
  isGameComplete,
  matchComplete,
  neededGames,
  pointsTarget,
  tennisLabel,
} from './scoring.js';
import { computeStandings, sortStandings } from './standings.js';
import { expectedPlayerCount, formatMatchLine, genderCounts } from './pairing.js';
import { FORMAT_OPTIONS, formatTitle } from './formats.js';
import { PAIR_CHANGE_METHODS } from './fixed.js';
import { ensureMatchGames } from './state.js';

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

function playerName(playersById, id) {
  return esc(playersById.get(id)?.name || id);
}

function teamLabel(playersById, ids) {
  return `${playerName(playersById, ids[0])} / ${playerName(playersById, ids[1])}`;
}

export function canPlayMixed(players) {
  const { m, f } = genderCounts(players);
  return m === f && m > 0;
}

export function wizardSteps(state) {
  const format = state.settings.tournamentFormat || 'free';
  const steps = ['format', 'courts', 'mixed'];
  if (format === 'free') steps.push('lock');
  steps.push('table', 'score', 'qual');
  return steps;
}

export function scoringSummary(s) {
  if (s.scoringMode === 'games') {
    return `теннис, ${s.gamesPerPairing} ${ruGames(s.gamesPerPairing)}${s.decidingGame ? ' + решающий' : ''}`;
  }
  const n = s.pointsPreset === 'custom' ? s.customPoints : s.pointsPreset;
  return `очки до ${n}${s.winByTwo ? ', ±2' : ''}`;
}

function setupSummary(state) {
  const s = state.settings;
  const parts = [
    formatTitle(s.tournamentFormat),
    `${s.courts} корт${s.courts === 3 ? 'а' : 'а'}`,
    s.pairType === 'mixed' ? 'М+Ж' : 'любые пары',
    s.tournamentFormat === 'free' ? (s.pairLock === 'unlocked' ? 'пары каждый круг' : 'пары закреплены') : null,
    s.standingsSort === 'wins' ? 'таблица по победам' : 'таблица по очкам',
    scoringSummary(s),
    s.qualifyingEnabled ? 'есть квалификация' : null,
  ].filter(Boolean);
  return parts.join(' · ');
}

export function renderApp(root, state) {
  const tab = state.ui.tab || 'players';
  root.innerHTML = `
    <header class="top">
      <div>
        <p class="eyebrow">Иркутск · любители</p>
        <h1>Мини-турнир</h1>
      </div>
    </header>
    ${state.ui.toast ? `<div class="toast" role="status">${esc(state.ui.toast)}</div>` : ''}
    <main class="main" id="main">${renderTab(state, tab)}</main>
    <nav class="tabs" aria-label="Разделы">
      ${tabBtn('players', 'Участники', tab)}
      ${tabBtn('play', 'Игры', tab)}
      ${tabBtn('table', 'Таблица', tab)}
      ${tabBtn('settings', 'Ещё', tab)}
    </nav>
  `;
}

function tabBtn(id, label, current) {
  return `<button type="button" class="tab ${current === id ? 'is-on' : ''}" data-action="tab" data-tab="${id}" ${
    current === id ? 'aria-current="page"' : ''
  }>${label}</button>`;
}

function renderTab(state, tab) {
  if (tab === 'players') return renderPlayers(state);
  if (tab === 'play') return renderPlay(state);
  if (tab === 'table') return renderTable(state);
  return renderSettings(state);
}

function renderPlayers(state) {
  const need = expectedPlayerCount(state.settings.courts);
  const { players } = state;
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
  const ready = players.length === need;
  return `
    <section class="card">
      <h2>Участники</h2>
      <p class="hint">${players.length} из ${need} · ${state.settings.courts} корт${state.settings.courts === 3 ? 'а' : 'а'}</p>
      <ul class="player-list">${rows || '<li class="empty">Пока никого нет</li>'}</ul>
      <form class="add-row" data-action="add-player-form">
        <input class="input" id="add-name" name="name" placeholder="Имя игрока" maxlength="40" autocomplete="off" required />
        <button class="btn btn-primary" type="submit">Добавить</button>
      </form>
      ${
        ready && !state.settings.setupDone
          ? `<button type="button" class="btn btn-primary" data-action="tab" data-tab="play" style="width:100%;margin-top:12px">Дальше — начать</button>`
          : ''
      }
    </section>
  `;
}

function renderPlay(state) {
  const need = expectedPlayerCount(state.settings.courts);
  const playersById = new Map(state.players.map((p) => [p.id, p]));
  if (state.players.length !== need) {
    return `
      <section class="card">
        <h2>Игры</h2>
        <p class="hint">Добавьте ровно ${need} игроков на вкладке «Участники» (сейчас ${state.players.length}).</p>
      </section>`;
  }
  if (!state.settings.setupDone) {
    return renderWizard(state);
  }

  const last = state.rounds[state.rounds.length - 1];
  const lastDone = last && last.matches.every((m) => matchComplete(m, state.settings, last.kind));
  const canQual = state.settings.qualifyingEnabled && !state.rounds.some((r) => r.kind === 'qualifying');
  const format = state.settings.tournamentFormat || 'free';
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
  actions.push(
    `<button type="button" class="btn btn-ghost" data-action="open-new-pairs" id="btn-change-pairs">Сменить пары</button>`,
  );

  const history = state.rounds
    .map((round, index) => renderRound(state, round, index, playersById, index === state.rounds.length - 1))
    .reverse()
    .join('');

  return `
    <section class="stack">
      <p class="summary-line">
        <span>${esc(setupSummary(state))}</span>
        <button type="button" class="linkish summary-edit" data-action="tab" data-tab="settings">Изменить</button>
      </p>
      <div class="card play-bar">
        <div class="actions">${actions.join('')}</div>
      </div>
      ${state.ui.rebuildOffer != null ? renderRebuildOffer(state) : ''}
      ${state.ui.newPairsOpen ? renderChangePairsPanel(state, last, lastDone) : ''}
      ${history || '<div class="card"><p class="hint">Кругов ещё нет — нажмите «Начать круг».</p></div>'}
    </section>
  `;
}

function renderRebuildOffer(state) {
  return `
    <div class="card callout" id="rebuild-offer">
      <p>Счёт прошлого круга изменился, а следующий ещё без очков.</p>
      <div class="actions">
        <button type="button" class="btn btn-primary" data-action="rebuild-next">Пересобрать следующий круг</button>
        <button type="button" class="btn btn-ghost" data-action="rebuild-skip">Оставить как есть</button>
      </div>
    </div>`;
}

function renderChangePairsPanel(state, last, lastDone) {
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
                <input type="checkbox" data-action="toggle-ui" data-key="discardUnfinished" ${state.ui.discardUnfinished ? 'checked' : ''} />
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

function renderWizard(state) {
  const steps = wizardSteps(state);
  const step = Math.min(state.ui.setupStep || 0, steps.length - 1);
  const id = steps[step];
  const last = step === steps.length - 1;
  return `
    <section class="stack">
      <div class="card">
        <p class="hint">Шаг ${step + 1} из ${steps.length} · можно поменять потом</p>
        ${renderWizardStep(state, id)}
        <div class="actions wizard-nav">
          ${step > 0 ? `<button type="button" class="btn btn-ghost" data-action="setup-back">Назад</button>` : ''}
          ${
            last
              ? `<button type="button" class="btn btn-primary" data-action="setup-start" id="btn-setup-start">Начать</button>`
              : `<button type="button" class="btn btn-primary" data-action="setup-next" id="btn-setup-next">Дальше</button>`
          }
        </div>
      </div>
    </section>
  `;
}

function renderWizardStep(state, id) {
  const s = state.settings;
  if (id === 'format') {
    return `
      <h2>Формат</h2>
      <div class="format-list">
        ${FORMAT_OPTIONS.map(
          (f) => `
          <button type="button" class="format-opt ${s.tournamentFormat === f.id ? 'is-on' : ''}" data-action="setting-val" data-key="tournamentFormat" data-value="${f.id}">
            <strong>${esc(f.title)}</strong>
            <span>${esc(f.hint)}</span>
          </button>`,
        ).join('')}
      </div>`;
  }
  if (id === 'courts') {
    return `
      <h2>Сколько кортов</h2>
      <div class="seg">
        <button type="button" class="seg-btn ${s.courts === 2 ? 'is-on' : ''}" data-action="courts" data-n="2">2 корта · 8</button>
        <button type="button" class="seg-btn ${s.courts === 3 ? 'is-on' : ''}" data-action="courts" data-n="3">3 корта · 12</button>
      </div>`;
  }
  if (id === 'mixed') {
    const ok = canPlayMixed(state.players);
    if (!ok) {
      return `
        <h2>Играем М+Ж?</h2>
        <p class="hint">Мужчин и женщин не поровну (${genderCounts(state.players).m} и ${genderCounts(state.players).f}) — пары будут любые. Чтобы включить М+Ж, поправьте пол на «Участниках».</p>`;
    }
    return `
      <h2>Играем М+Ж?</h2>
      <div class="seg">
        <button type="button" class="seg-btn ${s.pairType === 'mixed' ? 'is-on' : ''}" data-action="setting-val" data-key="pairType" data-value="mixed">Да</button>
        <button type="button" class="seg-btn ${s.pairType === 'any' ? 'is-on' : ''}" data-action="setting-val" data-key="pairType" data-value="any">Нет</button>
      </div>`;
  }
  if (id === 'lock') {
    return `
      <h2>Пары</h2>
      <div class="format-list">
        <button type="button" class="format-opt ${s.pairLock !== 'unlocked' ? 'is-on' : ''}" data-action="setting-val" data-key="pairLock" data-value="locked">
          <strong>Закреплённые</strong>
          <span>Одни и те же пары, пока не нажмёте «Сменить пары». Соперники — ближайшие по силе.</span>
        </button>
        <button type="button" class="format-opt ${s.pairLock === 'unlocked' ? 'is-on' : ''}" data-action="setting-val" data-key="pairLock" data-value="unlocked">
          <strong>Не закреплённые</strong>
          <span>Каждый круг заново: 1+последний (при М+Ж — сильный М со слабой Ж).</span>
        </button>
      </div>`;
  }
  if (id === 'table') {
    return `
      <h2>Таблица</h2>
      <p class="hint">Главная сортировка. При равенстве — второй показатель, затем разница очков.</p>
      <div class="seg">
        <button type="button" class="seg-btn ${s.standingsSort !== 'wins' ? 'is-on' : ''}" data-action="setting-val" data-key="standingsSort" data-value="points">По очкам</button>
        <button type="button" class="seg-btn ${s.standingsSort === 'wins' ? 'is-on' : ''}" data-action="setting-val" data-key="standingsSort" data-value="wins">По победам</button>
      </div>`;
  }
  if (id === 'score') {
    return `<h2>Счёт</h2>${renderScoringFields(s)}`;
  }
  return `
    <h2>Квалификация</h2>
    <p class="hint">Один случайный круг для стартового рейтинга. Можно пропустить.</p>
    <div class="seg">
      <button type="button" class="seg-btn ${!s.qualifyingEnabled ? 'is-on' : ''}" data-action="toggle-bool" data-key="qualifyingEnabled" data-value="0">Нет</button>
      <button type="button" class="seg-btn ${s.qualifyingEnabled ? 'is-on' : ''}" data-action="toggle-bool" data-key="qualifyingEnabled" data-value="1">Да</button>
    </div>
    ${
      s.qualifyingEnabled
        ? `<div class="seg" style="margin-top:8px">
            <button type="button" class="seg-btn ${s.qualifyingPoints === 15 ? 'is-on' : ''}" data-action="qual-pts" data-n="15">До 15</button>
            <button type="button" class="seg-btn ${s.qualifyingPoints === 17 ? 'is-on' : ''}" data-action="qual-pts" data-n="17">До 17</button>
          </div>`
        : ''
    }`;
}

function renderScoringFields(s) {
  const pointsMode = s.scoringMode !== 'games';
  return `
    <div class="seg">
      <button type="button" class="seg-btn ${pointsMode ? 'is-on' : ''}" data-action="setting-val" data-key="scoringMode" data-value="points">По очкам</button>
      <button type="button" class="seg-btn ${!pointsMode ? 'is-on' : ''}" data-action="setting-val" data-key="scoringMode" data-value="games">Теннис, геймы</button>
    </div>
    <div class="${pointsMode ? '' : 'is-hidden'}">
      <p class="field-label">До скольких</p>
      <div class="seg wrap">
        ${[11, 15, 21].map((n) => `<button type="button" class="seg-btn ${s.pointsPreset === n ? 'is-on' : ''}" data-action="preset" data-n="${n}">${n}</button>`).join('')}
        <button type="button" class="seg-btn ${s.pointsPreset === 'custom' ? 'is-on' : ''}" data-action="preset" data-n="custom">Своё</button>
      </div>
      ${
        s.pointsPreset === 'custom'
          ? `<label class="field">Своё N
              <input class="input" type="number" min="3" max="99" data-action="setting" data-key="customPoints" value="${esc(s.customPoints)}" />
            </label>`
          : ''
      }
      <label class="toggle">
        <input type="checkbox" data-action="toggle" data-key="winByTwo" ${s.winByTwo ? 'checked' : ''} />
        <span>Победа с разницей в 2</span>
      </label>
    </div>
    <div class="${pointsMode ? 'is-hidden' : ''}">
      <label class="field">Геймов в матче
        <input class="input" type="number" min="1" max="7" data-action="setting" data-key="gamesPerPairing" value="${esc(s.gamesPerPairing)}" />
      </label>
      <label class="toggle">
        <input type="checkbox" data-action="toggle" data-key="decidingGame" ${s.decidingGame ? 'checked' : ''} />
        <span>Решающий при ничьей</span>
      </label>
    </div>`;
}

function roundTitle(round, index) {
  if (round.kind === 'qualifying') return 'Квалификация';
  const n = round.number || index;
  const fmt = round.format && round.format !== 'free' && round.format !== 'qualifying' ? ` · ${formatTitle(round.format)}` : '';
  const early = round.closedEarly ? ' · закрыт досрочно' : '';
  return `Круг ${n}${fmt}${early}`;
}

function renderRound(state, round, index, playersById, isCurrent) {
  const cards = round.matches
    .slice()
    .sort((a, b) => a.court - b.court)
    .map((match) => renderMatch(state, round, index, match, playersById, isCurrent))
    .join('');
  const lines = round.matches
    .slice()
    .sort((a, b) => a.court - b.court)
    .map((m) => `<p class="court-line">${esc(formatMatchLine(m, playersById))}</p>`)
    .join('');
  return `
    <article class="card round ${isCurrent ? 'is-current' : ''}">
      <h3>${esc(roundTitle(round, index))}</h3>
      ${round.note ? `<p class="move-note">${esc(round.note)}</p>` : ''}
      <div class="court-lines">${lines}</div>
      ${cards}
    </article>
  `;
}

function renderMatch(state, round, roundIndex, match, playersById, isCurrent) {
  ensureMatchGames(match, state.settings, round.kind);
  const n = neededGames(state.settings, round.kind, match.games);
  const games = match.games.slice(0, n);
  const target = pointsTarget(state.settings, round.kind);
  const winByTwo = round.kind === 'qualifying' ? false : state.settings.winByTwo;
  const sum = gamesSum(games.filter(isGameComplete));
  const showTennis = state.settings.scoringMode === 'games' && round.kind !== 'qualifying';
  const gameRows = games
    .map((g, gi) => {
      const board =
        showTennis && isCurrent
          ? renderScoreboard(state, roundIndex, match.court, gi, g)
          : '';
      const label =
        n === 1
          ? 'Счёт'
          : `Гейм ${gi + 1}${gi === n - 1 && n > (round.kind === 'qualifying' ? 1 : state.settings.gamesPerPairing) ? ' · решающий' : ''}`;
      return `
        <div class="score-row">
          <span class="score-label">${label}</span>
          <div class="score-inputs">
            ${scoreInput(roundIndex, match.court, gi, 'a', g.a, target, winByTwo)}
            <span class="score-colon">:</span>
            ${scoreInput(roundIndex, match.court, gi, 'b', g.b, target, winByTwo)}
          </div>
          ${board}
        </div>`;
    })
    .join('');
  return `
    <div class="match">
      <div class="match-head">
        <span class="badge">Корт ${match.court}${match.sequence ? ` · смена ${match.sequence}` : ''}</span>
        ${isGameComplete({ a: sum.a, b: sum.b }) && games.some(isGameComplete) ? `<span class="sum">${sum.a} — ${sum.b}</span>` : ''}
      </div>
      <div class="teams">
        <p class="team">${teamLabel(playersById, match.teamA)}</p>
        <p class="vs">против</p>
        <p class="team">${teamLabel(playersById, match.teamB)}</p>
      </div>
      ${gameRows}
    </div>
  `;
}

function scoreInput(roundIndex, court, gameIndex, side, value, target, winByTwo) {
  const shown = value == null || value === '' ? '' : String(value);
  return `<input class="input score" inputmode="numeric" pattern="[0-9]*" type="text" maxlength="3"
    data-action="score"
    data-round="${roundIndex}" data-court="${court}" data-game="${gameIndex}" data-side="${side}"
    data-target="${target ?? ''}" data-winbytwo="${winByTwo ? '1' : '0'}"
    id="score-r${roundIndex}-c${court}-g${gameIndex}-${side}"
    value="${esc(shown)}" aria-label="Счёт" />`;
}

function renderScoreboard(state, roundIndex, court, gameIndex, game) {
  const tennis = game.tennis || { ptsA: 0, ptsB: 0 };
  const labels = tennisLabel(tennis.ptsA, tennis.ptsB);
  const open =
    state.ui.scoreboard &&
    state.ui.scoreboard.round === roundIndex &&
    state.ui.scoreboard.court === court &&
    state.ui.scoreboard.game === gameIndex;
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

function renderTable(state) {
  const primary = state.settings.standingsSort === 'wins' ? 'wins' : 'points';
  const sort = state.ui.sort || primary;
  const rows = sortStandings(computeStandings(state.players, state.rounds, state.settings), sort);
  const playersById = new Map(state.players.map((p) => [p.id, p]));
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
  const history = state.rounds
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

function renderSettings(state) {
  const s = state.settings;
  const format = s.tournamentFormat || 'free';
  const okMixed = canPlayMixed(state.players);
  return `
    <section class="stack">
      <div class="card">
        <h2>Турнир</h2>
        <p class="hint">${esc(setupSummary(state))}</p>
        <p class="field-label">Формат</p>
        <div class="format-list">
          ${FORMAT_OPTIONS.map(
            (f) => `
            <button type="button" class="format-opt ${format === f.id ? 'is-on' : ''}" data-action="setting-val" data-key="tournamentFormat" data-value="${f.id}">
              <strong>${esc(f.title)}</strong>
              <span>${esc(f.hint)}</span>
            </button>`,
          ).join('')}
        </div>
        ${
          format === 'mexicano'
            ? `<p class="field-label">Пары в четвёрке</p>
        <div class="seg">
          <button type="button" class="seg-btn ${s.mexicanoPairing !== '1-3' ? 'is-on' : ''}" data-action="setting-val" data-key="mexicanoPairing" data-value="1-4">1+4 vs 2+3</button>
          <button type="button" class="seg-btn ${s.mexicanoPairing === '1-3' ? 'is-on' : ''}" data-action="setting-val" data-key="mexicanoPairing" data-value="1-3">1+3 vs 2+4</button>
        </div>`
            : ''
        }
        <p class="field-label">Корты</p>
        <div class="seg">
          <button type="button" class="seg-btn ${s.courts === 2 ? 'is-on' : ''}" data-action="courts" data-n="2">2 · 8</button>
          <button type="button" class="seg-btn ${s.courts === 3 ? 'is-on' : ''}" data-action="courts" data-n="3">3 · 12</button>
        </div>
        <p class="field-label">М+Ж</p>
        ${
          okMixed
            ? `<div class="seg">
          <button type="button" class="seg-btn ${s.pairType === 'mixed' ? 'is-on' : ''}" data-action="setting-val" data-key="pairType" data-value="mixed">Да</button>
          <button type="button" class="seg-btn ${s.pairType === 'any' ? 'is-on' : ''}" data-action="setting-val" data-key="pairType" data-value="any">Нет</button>
        </div>`
            : '<p class="hint">Нужно поровну М и Ж. Сейчас пары любые.</p>'
        }
        ${
          format === 'free'
            ? `<p class="field-label">Пары</p>
        <div class="seg">
          <button type="button" class="seg-btn ${s.pairLock !== 'unlocked' ? 'is-on' : ''}" data-action="setting-val" data-key="pairLock" data-value="locked">Закреплённые</button>
          <button type="button" class="seg-btn ${s.pairLock === 'unlocked' ? 'is-on' : ''}" data-action="setting-val" data-key="pairLock" data-value="unlocked">Каждый круг</button>
        </div>
        ${
          s.pairLock !== 'unlocked'
            ? `<div class="seg">
          <button type="button" class="seg-btn ${s.lockedMatchups !== 'roundrobin' ? 'is-on' : ''}" data-action="setting-val" data-key="lockedMatchups" data-value="strength">Соперники по силе</button>
          <button type="button" class="seg-btn ${s.lockedMatchups === 'roundrobin' ? 'is-on' : ''}" data-action="setting-val" data-key="lockedMatchups" data-value="roundrobin">Круговой график</button>
        </div>`
            : ''
        }`
            : ''
        }
        <p class="field-label">Таблица</p>
        <div class="seg">
          <button type="button" class="seg-btn ${s.standingsSort !== 'wins' ? 'is-on' : ''}" data-action="setting-val" data-key="standingsSort" data-value="points">Очки</button>
          <button type="button" class="seg-btn ${s.standingsSort === 'wins' ? 'is-on' : ''}" data-action="setting-val" data-key="standingsSort" data-value="wins">Победы</button>
        </div>
      </div>
      <div class="card">
        <h2>Счёт</h2>
        ${renderScoringFields(s)}
      </div>
      <div class="card">
        <h2>Квалификация</h2>
        <label class="toggle">
          <input type="checkbox" data-action="toggle" data-key="qualifyingEnabled" ${s.qualifyingEnabled ? 'checked' : ''} />
          <span>Сортировочный круг</span>
        </label>
        ${
          s.qualifyingEnabled
            ? `<div class="seg">
          <button type="button" class="seg-btn ${s.qualifyingPoints === 15 ? 'is-on' : ''}" data-action="qual-pts" data-n="15">До 15</button>
          <button type="button" class="seg-btn ${s.qualifyingPoints === 17 ? 'is-on' : ''}" data-action="qual-pts" data-n="17">До 17</button>
        </div>`
            : ''
        }
      </div>
      <div class="card danger-card">
        <h2>Данные</h2>
        <p class="hint">Только этот браузер. Сброс удалит игроков, круги и настройки.</p>
        <button type="button" class="btn btn-danger" data-action="reset">Сбросить / начать заново</button>
      </div>
    </section>
  `;
}
