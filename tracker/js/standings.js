import { countedGames, isGameComplete, gamesSum, settingsForRound } from './scoring.js';

export function playerMap(players) {
  const map = new Map();
  for (const p of players) map.set(p.id, p);
  return map;
}

function emptyRow(player) {
  return {
    id: player.id,
    name: player.name,
    gender: player.gender,
    wins: 0,
    losses: 0,
    ties: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    delta: 0,
    roundResults: [],
  };
}

function applyGameToSide(row, scored, conceded) {
  row.pointsFor += scored;
  row.pointsAgainst += conceded;
  if (scored > conceded) row.wins += 1;
  else if (scored < conceded) row.losses += 1;
  else row.ties += 1;
}

/**
 * Накопленная таблица по всем кругам. Каждая сыгранная игра даёт победу/поражение и очки.
 * Пары играют несколько игр подряд — все они входят в сумму.
 */
export function computeStandings(players, rounds, settings) {
  const rows = new Map();
  for (const p of players) rows.set(p.id, emptyRow(p));

  rounds.forEach((round, roundIndex) => {
    const snapshot = new Map();
    for (const p of players) {
      if (!rows.has(p.id)) rows.set(p.id, emptyRow(p));
    }
    for (const match of round.matches) {
      const roundSettings = settingsForRound(round, settings);
      const games = countedGames({ ...match, kind: round.kind }, roundSettings).filter(isGameComplete);
      const ids = [...match.teamA, ...match.teamB];
      for (const id of ids) {
        if (!rows.has(id)) {
          rows.set(id, emptyRow({ id, name: id, gender: 'M' }));
        }
      }
      for (const g of games) {
        for (const id of match.teamA) applyGameToSide(rows.get(id), Number(g.a), Number(g.b));
        for (const id of match.teamB) applyGameToSide(rows.get(id), Number(g.b), Number(g.a));
      }
      const sum = gamesSum(games);
      const line = {
        roundIndex,
        kind: round.kind,
        court: match.court,
        teamA: match.teamA,
        teamB: match.teamB,
        pointsA: sum.a,
        pointsB: sum.b,
      };
      for (const id of ids) {
        const copy = { ...line, side: match.teamA.includes(id) ? 'a' : 'b' };
        snapshot.set(id, copy);
      }
    }
    for (const [id, row] of rows) {
      const rec = snapshot.get(id);
      if (rec) row.roundResults.push(rec);
    }
  });

  for (const row of rows.values()) {
    row.delta = row.pointsFor - row.pointsAgainst;
  }
  return [...rows.values()];
}

export function sortStandings(rows, sort) {
  const copy = rows.slice();
  copy.sort((x, y) => compareStandings(x, y, sort) || x.name.localeCompare(y.name, 'ru'));
  return copy;
}

function compareStandings(a, b, sort) {
  if (sort === 'wins') {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
    if (b.delta !== a.delta) return b.delta - a.delta;
  } else if (sort === 'delta') {
    if (b.delta !== a.delta) return b.delta - a.delta;
    if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
    if (b.wins !== a.wins) return b.wins - a.wins;
  } else {
    if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.delta !== a.delta) return b.delta - a.delta;
  }
  return 0;
}

export function standingOf(standings, id) {
  return standings.find((s) => s.id === id) || { id, pointsFor: 0, delta: 0, wins: 0, losses: 0 };
}

export function rankPlayers(players, standings, mode = 'points') {
  const byId = new Map(standings.map((s) => [s.id, s]));
  return players.slice().sort((a, b) => {
    const sa = byId.get(a.id) || { pointsFor: 0, delta: 0, wins: 0 };
    const sb = byId.get(b.id) || { pointsFor: 0, delta: 0, wins: 0 };
    return compareStandings(sa, sb, mode) || (a.name || '').localeCompare(b.name || '', 'ru');
  });
}
