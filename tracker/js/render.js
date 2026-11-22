import {
  autoFillOther,
  gamesSum,
  isGameComplete,
  matchComplete,
  neededGames,
  pointsTarget,
  tennisLabel,
} from './scoring.js';
import { computeStandings, sortStandings } from './standings.js';
import { expectedPlayerCount, formatMatchLine } from './pairing.js';
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
      ${tabBtn('settings', 'Настройки', tab)}
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
  return `
    <section class="card">
      <h2>Участники</h2>
      <p class="hint">${players.length} из ${need} · ${state.settings.courts} корт${state.settings.courts === 3 ? 'а' : 'а'}</p>
      <ul class="player-list">${rows || '<li class="empty">Пока никого нет</li>'}</ul>
      <form class="add-row" data-action="add-player-form">
        <input class="input" id="add-name" name="name" placeholder="Имя игрока" maxlength="40" autocomplete="off" required />
        <button class="btn btn-primary" type="submit">Добавить</button>
      </form>
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
  const last = state.rounds[state.rounds.length - 1];
  const lastDone = last && last.matches.every((m) => matchComplete(m, state.settings, last.kind));
  const canQual = state.settings.qualifyingEnabled && !state.rounds.some((r) => r.kind === 'qualifying');
  const actions = [];
  if (!last || lastDone) {
    if (canQual) {
      actions.push(
        `<button type="button" class="btn btn-primary" data-action="gen-round" data-kind="qualifying">Начать квалификацию</button>`,
      );
    }
    actions.push(
      `<button type="button" class="btn ${canQual ? 'btn-ghost' : 'btn-primary'}" data-action="gen-round" data-kind="regular">${
        last ? 'Следующий круг' : 'Сгенерировать пары'
      }</button>`,
    );
  } else if (last && !last.matches.some((m) => (m.games || []).some(isGameComplete))) {
    actions.push(
      `<button type="button" class="btn btn-ghost" data-action="regen-round">Перегенерировать пары</button>`,
    );
  }

  const history = state.rounds
    .map((round, index) => renderRound(state, round, index, playersById, index === state.rounds.length - 1))
    .reverse()
    .join('');

  return `
    <section class="stack">
      <div class="card">
        <h2>Круги</h2>
        <p class="hint">Пара играет ${state.settings.gamesPerPairing} ${ruGames(state.settings.gamesPerPairing)} подряд, очки суммируются, затем напарники меняются.</p>
        <div class="actions">${actions.join('')}</div>
      </div>
      ${history || '<div class="card"><p class="hint">Кругов ещё нет.</p></div>'}
    </section>
  `;
}

function roundTitle(round, index) {
  if (round.kind === 'qualifying') return 'Квалификация';
  const n = round.number || index;
  return `Круг ${n}`;
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
      return `
        <div class="score-row">
          <span class="score-label">${n === 1 ? 'Счёт' : `Игра ${gi + 1}`}${gi === n - 1 && n > (round.kind === 'qualifying' ? 1 : state.settings.gamesPerPairing) ? ' · решающая' : ''}</span>
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
        <span class="badge">Корт ${match.court}</span>
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
  const rows = sortStandings(
    computeStandings(state.players, state.rounds, state.settings),
    state.ui.sort || 'points',
  );
  const sort = state.ui.sort || 'points';
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
  const last = state.rounds[state.rounds.length - 1];
  const lastDone = last && last.matches.every((m) => matchComplete(m, state.settings, last.kind));
  const nextHint =
    last && !lastDone
      ? `<div class="hist-block"><h4>Сейчас играют</h4>${last.matches
          .slice()
          .sort((a, b) => a.court - b.court)
          .map((m) => `<p class="court-line">${esc(formatMatchLine(m, playersById))}</p>`)
          .join('')}</div>`
      : lastDone
        ? '<p class="hint">Следующий круг ещё не сгенерирован — откройте «Игры».</p>'
        : '';
  return `
    <section class="stack">
      <div class="card">
        <h2>Таблица</h2>
        <div class="seg sort-seg" role="group" aria-label="Сортировка">
          <button type="button" class="seg-btn ${sort === 'points' ? 'is-on' : ''}" data-action="sort" data-sort="points">Очки</button>
          <button type="button" class="seg-btn ${sort === 'delta' ? 'is-on' : ''}" data-action="sort" data-sort="delta">Разница</button>
          <button type="button" class="seg-btn ${sort === 'wins' ? 'is-on' : ''}" data-action="sort" data-sort="wins">Победы</button>
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
        ${nextHint}
      </div>
    </section>
  `;
}

function renderSettings(state) {
  const s = state.settings;
  const pointsMode = s.scoringMode === 'points';
  return `
    <section class="stack">
      <div class="card">
        <h2>Счёт</h2>
        <label class="field">Режим
          <select class="input" data-action="setting" data-key="scoringMode">
            <option value="points" ${s.scoringMode === 'points' ? 'selected' : ''}>Очки / сеты</option>
            <option value="games" ${s.scoringMode === 'games' ? 'selected' : ''}>Геймы как в теннисе</option>
          </select>
        </label>
        <div class="${pointsMode ? '' : 'is-hidden'}">
          <p class="field-label">До скольких очков</p>
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
            <span>Победа с разницей в 2 очка</span>
          </label>
        </div>
        <label class="field">Игр у пары подряд
          <input class="input" type="number" min="1" max="7" data-action="setting" data-key="gamesPerPairing" value="${esc(s.gamesPerPairing)}" />
        </label>
        <label class="toggle">
          <input type="checkbox" data-action="toggle" data-key="decidingGame" ${s.decidingGame ? 'checked' : ''} />
          <span>Решающая игра при ничьей (например 3–3)</span>
        </label>
      </div>
      <div class="card">
        <h2>Квалификация</h2>
        <label class="toggle">
          <input type="checkbox" data-action="toggle" data-key="qualifyingEnabled" ${s.qualifyingEnabled ? 'checked' : ''} />
          <span>Сортировочный круг</span>
        </label>
        <div class="seg">
          <button type="button" class="seg-btn ${s.qualifyingPoints === 15 ? 'is-on' : ''}" data-action="qual-pts" data-n="15">До 15</button>
          <button type="button" class="seg-btn ${s.qualifyingPoints === 17 ? 'is-on' : ''}" data-action="qual-pts" data-n="17">До 17</button>
        </div>
        <p class="hint">Случайные пары, одна игра. По очкам строится рейтинг для следующих кругов.</p>
      </div>
      <div class="card">
        <h2>Пары и корты</h2>
        <p class="field-label">Тип пар</p>
        <div class="seg">
          <button type="button" class="seg-btn ${s.pairType === 'mixed' ? 'is-on' : ''}" data-action="setting-val" data-key="pairType" data-value="mixed">Только М+Ж</button>
          <button type="button" class="seg-btn ${s.pairType === 'any' ? 'is-on' : ''}" data-action="setting-val" data-key="pairType" data-value="any">Любые</button>
        </div>
        <p class="field-label">Как мешать</p>
        <div class="seg">
          <button type="button" class="seg-btn ${s.pairMethod === 'ranking' ? 'is-on' : ''}" data-action="setting-val" data-key="pairMethod" data-value="ranking">1+последний</button>
          <button type="button" class="seg-btn ${s.pairMethod === 'random' ? 'is-on' : ''}" data-action="setting-val" data-key="pairMethod" data-value="random">Случайно</button>
        </div>
        <p class="field-label">Корты</p>
        <div class="seg">
          <button type="button" class="seg-btn ${s.courts === 2 ? 'is-on' : ''}" data-action="courts" data-n="2">2 корта · 8</button>
          <button type="button" class="seg-btn ${s.courts === 3 ? 'is-on' : ''}" data-action="courts" data-n="3">3 корта · 12</button>
        </div>
        <label class="toggle">
          <input type="checkbox" data-action="toggle" data-key="kingOfTheCourt" ${s.kingOfTheCourt ? 'checked' : ''} />
          <span>Король корта: победители вверх, проигравшие вниз</span>
        </label>
      </div>
      <div class="card danger-card">
        <h2>Данные</h2>
        <p class="hint">Всё хранится только в этом браузере. Сброс удалит игроков, круги и настройки.</p>
        <button type="button" class="btn btn-danger" data-action="reset">Сбросить / начать заново</button>
      </div>
    </section>
  `;
}

export { autoFillOther };
