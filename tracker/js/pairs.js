/** Общие операции с парами: ключи, смешанность, разбиение четырёх. */

export function partnerKey(a, b) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export function expectedPlayerCount(courts) {
  return Number(courts) * 4;
}

/** Корты = floor(игроков / 4). Лишние сидят по очереди. */
export function autoCourts(playerCount) {
  return Math.max(0, Math.floor(Number(playerCount) / 4));
}

export function rotateSitters(playerIds, roundIndex) {
  const ids = playerIds.slice();
  const sitCount = ids.length % 4;
  if (sitCount === 0) return { sitting: [], playing: ids };
  const n = ids.length;
  const start = ((Number(roundIndex) % n) + n) % n;
  const rotated = ids.slice(start).concat(ids.slice(0, start));
  return { sitting: rotated.slice(0, sitCount), playing: rotated.slice(sitCount) };
}

export function splitSitters(players, roundIndex) {
  const { sitting, playing } = rotateSitters(
    players.map((p) => p.id),
    roundIndex,
  );
  const playSet = new Set(playing);
  return {
    sitting,
    playing,
    playingPlayers: players.filter((p) => playSet.has(p.id)),
  };
}

export function sittingNote(sitting, players) {
  if (!sitting?.length) return '';
  const byId = playersByIdMap(players);
  const names = sitting.map((id) => byId.get(id)?.name || id).join(', ');
  return `Не играют: ${names}`;
}

export function genderCounts(players) {
  let m = 0;
  let f = 0;
  for (const p of players) {
    if (p.gender === 'F') f += 1;
    else m += 1;
  }
  return { m, f };
}

export function partnerCounts(rounds) {
  const map = new Map();
  for (const round of rounds) {
    for (const match of round.matches) {
      bump(map, match.teamA[0], match.teamA[1]);
      bump(map, match.teamB[0], match.teamB[1]);
    }
  }
  return map;
}

function bump(map, a, b) {
  const k = partnerKey(a, b);
  map.set(k, (map.get(k) || 0) + 1);
}

export function pairRepeatScore(teamA, teamB, counts) {
  return (
    (counts.get(partnerKey(teamA[0], teamA[1])) || 0) +
    (counts.get(partnerKey(teamB[0], teamB[1])) || 0)
  );
}

export function isMixedTeam(playersById, ids) {
  const g0 = playersById.get(ids[0])?.gender;
  const g1 = playersById.get(ids[1])?.gender;
  return Boolean(g0 && g1 && g0 !== g1);
}

export function matchIsMixed(playersById, match) {
  return isMixedTeam(playersById, match.teamA) && isMixedTeam(playersById, match.teamB);
}

/** Три способа разбить четырёх игроков на две пары. */
export function pairingsOfFour(ids) {
  const [a, b, c, d] = ids;
  return [
    { teamA: [a, b], teamB: [c, d] },
    { teamA: [a, c], teamB: [b, d] },
    { teamA: [a, d], teamB: [b, c] },
  ];
}

export function bestPairingOfFour(ids, playersById, counts, mixed, rng = Math.random) {
  const options = pairingsOfFour(ids);
  let best = [];
  let bestScore = Infinity;
  for (const opt of options) {
    if (mixed && !matchIsMixed(playersById, opt)) continue;
    const score = pairRepeatScore(opt.teamA, opt.teamB, counts) + rng() * 0.01;
    if (score < bestScore) {
      bestScore = score;
      best = [opt];
    } else if (Math.abs(score - bestScore) < 1e-9) {
      best.push(opt);
    }
  }
  if (!best.length) {
    bestScore = Infinity;
    for (const opt of options) {
      const score = pairRepeatScore(opt.teamA, opt.teamB, counts) + rng() * 0.01;
      if (score < bestScore) {
        bestScore = score;
        best = [opt];
      }
    }
  }
  return best[0] || options[0];
}

export function idsOf(players) {
  return players.map((p) => p.id);
}

/**
 * Пары по рейтингу: 1+последний, 2+(n-1), … затем сильнейшая пара против слабейшей на корте 1.
 */
export function rankingPartnerPairs(ranked, mixed) {
  const remaining = ranked.slice();
  const pairs = [];
  while (remaining.length >= 2) {
    const first = remaining.shift();
    let idx = remaining.length - 1;
    if (mixed) {
      while (idx >= 0 && remaining[idx].gender === first.gender) idx -= 1;
      if (idx < 0) idx = remaining.length - 1;
    }
    const partner = remaining.splice(idx, 1)[0];
    pairs.push([first, partner]);
  }
  return pairs;
}

export function pairsToMatches(pairs) {
  const matches = [];
  const n = pairs.length;
  for (let i = 0; i < n / 2; i += 1) {
    matches.push({
      court: i + 1,
      teamA: idsOf(pairs[i]),
      teamB: idsOf(pairs[n - 1 - i]),
      games: [],
    });
  }
  return matches;
}

export function emptyMatch(court, teamA, teamB, extra = {}) {
  return { court, teamA: teamA.slice(), teamB: teamB.slice(), games: [], ...extra };
}

export function formatMatchLine(match, playersById) {
  const name = (id) => playersById.get(id)?.name || id;
  const a = `${name(match.teamA[0])} / ${name(match.teamA[1])}`;
  const b = `${name(match.teamB[0])} / ${name(match.teamB[1])}`;
  const seq = match.sequence ? ` · смена ${match.sequence}` : '';
  return `Корт ${match.court}${seq}: ${a} — ${b}`;
}

/** Одна строка на корт: «Корт 1: Вася/Маша 15:6 Ира/Катя». Пустой счёт — «–:–». */
export function compactMatchLine(match, playersById, scoreText) {
  const name = (id) => playersById.get(id)?.name || id;
  const a = `${name(match.teamA[0])}/${name(match.teamA[1])}`;
  const b = `${name(match.teamB[0])}/${name(match.teamB[1])}`;
  const court = match.sequence ? `Корт ${match.court}·${match.sequence}` : `Корт ${match.court}`;
  const score = scoreText == null || scoreText === '' ? '–:–' : scoreText;
  return `${court}: ${a} ${score} ${b}`;
}

export function compactSittingLine(sitting, playersById) {
  if (!sitting?.length) return '';
  const names = sitting.map((id) => playersById.get(id)?.name || id).join(', ');
  return `Сидят: ${names}`;
}

export function playersByIdMap(players) {
  return new Map(players.map((p) => [p.id, p]));
}

export function courtPlayersFromMatches(matches) {
  const byCourt = new Map();
  for (const match of matches) {
    const court = match.court;
    if (!byCourt.has(court)) byCourt.set(court, []);
    const list = byCourt.get(court);
    for (const id of [...match.teamA, ...match.teamB]) {
      if (!list.includes(id)) list.push(id);
    }
  }
  return [...byCourt.entries()].sort((a, b) => a[0] - b[0]).map(([, ids]) => ids);
}
