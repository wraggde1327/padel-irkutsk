import { shuffle } from './rng.js';
import { countedGames, gamesSum } from './scoring.js';
import { rankPlayers } from './standings.js';

export function partnerKey(a, b) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export function expectedPlayerCount(courts) {
  return Number(courts) * 4;
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

function pairRepeatScore(teamA, teamB, counts) {
  return (
    (counts.get(partnerKey(teamA[0], teamA[1])) || 0) +
    (counts.get(partnerKey(teamB[0], teamB[1])) || 0)
  );
}

function isMixedTeam(playersById, ids) {
  const g0 = playersById.get(ids[0])?.gender;
  const g1 = playersById.get(ids[1])?.gender;
  return g0 && g1 && g0 !== g1;
}

function matchIsMixed(playersById, match) {
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

function bestPairingOfFour(ids, playersById, counts, mixed, rng) {
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

function idsOf(players) {
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

function randomMatches(players, courts, mixed, counts, playersById, rng, unusual, rankedIds) {
  const need = courts * 4;
  const list = players.slice();
  let best = null;
  let bestScore = Infinity;
  const attempts = 360;
  for (let i = 0; i < attempts; i += 1) {
    const shuffled = shuffle(list, rng);
    if (shuffled.length < need) break;
    const matches = [];
    let ok = true;
    let score = 0;
    for (let c = 0; c < courts; c += 1) {
      const group = shuffled.slice(c * 4, c * 4 + 4).map((p) => p.id);
      const pairing = bestPairingOfFour(group, playersById, counts, mixed, rng);
      if (mixed && !matchIsMixed(playersById, pairing)) ok = false;
      score += pairRepeatScore(pairing.teamA, pairing.teamB, counts) * 100;
      if (unusual && rankedIds) {
        score += classicPartnerPenalty(pairing, rankedIds) * 8;
      }
      matches.push({
        court: c + 1,
        teamA: pairing.teamA,
        teamB: pairing.teamB,
        games: [],
      });
    }
    if (mixed && !ok) score += 10_000;
    if (score < bestScore) {
      bestScore = score;
      best = matches;
    }
  }
  return best;
}

function classicPartnerPenalty(match, rankedIds) {
  const n = rankedIds.length;
  const rank = new Map(rankedIds.map((id, i) => [id, i]));
  let penalty = 0;
  for (const team of [match.teamA, match.teamB]) {
    const r0 = rank.get(team[0]);
    const r1 = rank.get(team[1]);
    if (r0 == null || r1 == null) continue;
    if (r0 + r1 === n - 1) penalty += 1;
  }
  return penalty;
}

function qualifyingMatches(players, courts, mixed, playersById, rng) {
  const need = courts * 4;
  const { m, f } = genderCounts(players);
  if (mixed && (m < courts || f < courts)) {
    throw new Error(
      `Для смешанных пар нужно минимум ${courts} игроков М и ${courts} Ж (сейчас ${m} и ${f}).`,
    );
  }
  let matches = null;
  for (let attempt = 0; attempt < 240; attempt += 1) {
    const shuffled = shuffle(players, rng).slice(0, need);
    const next = [];
    let ok = true;
    for (let c = 0; c < courts; c += 1) {
      const group = shuffled.slice(c * 4, c * 4 + 4);
      if (mixed) {
        const gc = genderCounts(group);
        if (gc.m !== 2 || gc.f !== 2) {
          ok = false;
          break;
        }
      }
      const pairing = bestPairingOfFour(idsOf(group), playersById, new Map(), mixed, rng);
      if (mixed && !matchIsMixed(playersById, pairing)) {
        ok = false;
        break;
      }
      next.push({
        court: c + 1,
        teamA: pairing.teamA,
        teamB: pairing.teamB,
        games: [],
      });
    }
    if (ok && next.length === courts) {
      matches = next;
      break;
    }
  }
  if (!matches) {
    if (mixed) {
      throw new Error('Не удалось собрать смешанные пары. Проверьте пол игроков.');
    }
    const shuffled = shuffle(players, rng).slice(0, need);
    matches = [];
    for (let c = 0; c < courts; c += 1) {
      const group = shuffled.slice(c * 4, c * 4 + 4);
      const pairing = bestPairingOfFour(idsOf(group), playersById, new Map(), false, rng);
      matches.push({
        court: c + 1,
        teamA: pairing.teamA,
        teamB: pairing.teamB,
        games: [],
      });
    }
  }
  return matches;
}

function winnersLosers(match, settings, kind) {
  const games = countedGames({ ...match, kind }, settings);
  const sum = gamesSum(games);
  if (sum.a > sum.b) return { winners: match.teamA, losers: match.teamB };
  if (sum.b > sum.a) return { winners: match.teamB, losers: match.teamA };
  return { winners: match.teamA, losers: match.teamB };
}

/** Победители вверх, проигравшие вниз. */
export function kingOfTheCourtGroups(matches, settings, kind) {
  const ordered = matches.slice().sort((a, b) => a.court - b.court);
  const wl = ordered.map((m) => winnersLosers(m, settings, kind));
  const n = wl.length;
  const groups = Array.from({ length: n }, () => []);
  if (n === 2) {
    groups[0] = [...wl[0].winners, ...wl[1].winners];
    groups[1] = [...wl[0].losers, ...wl[1].losers];
  } else if (n >= 3) {
    groups[0] = [...wl[0].winners, ...wl[1].winners];
    groups[1] = [...wl[0].losers, ...wl[n - 1].winners];
    groups[2] = [...wl[1].losers, ...wl[n - 1].losers];
  }
  return groups;
}

function matchesFromCourtGroups(groups, playersById, counts, mixed, rng) {
  return groups.map((ids, i) => {
    const pairing = bestPairingOfFour(ids, playersById, counts, mixed, rng);
    return {
      court: i + 1,
      teamA: pairing.teamA,
      teamB: pairing.teamB,
      games: [],
    };
  });
}

export function generateRound({
  players,
  settings,
  standings = [],
  rounds = [],
  kind = 'regular',
  courtGroups = null,
  rng = Math.random,
}) {
  const courts = Number(settings.courts) || 2;
  const need = expectedPlayerCount(courts);
  if (players.length !== need) {
    throw new Error(
      courts === 3
        ? 'Для трёх кортов нужно ровно 12 игроков.'
        : 'Для двух кортов нужно ровно 8 игроков.',
    );
  }
  const mixed = settings.pairType === 'mixed';
  if (mixed) {
    const { m, f } = genderCounts(players);
    if (m !== f) {
      throw new Error(`Для смешанных пар нужно поровну М и Ж (сейчас ${m} и ${f}).`);
    }
  }
  const playersById = new Map(players.map((p) => [p.id, p]));
  const counts = partnerCounts(rounds);
  const ranked = rankPlayers(players, standings);

  if (kind === 'qualifying') {
    return { matches: qualifyingMatches(players, courts, mixed, playersById, rng), warning: '' };
  }

  if (settings.kingOfTheCourt && courtGroups?.length === courts) {
    return {
      matches: matchesFromCourtGroups(courtGroups, playersById, counts, mixed, rng),
      warning: '',
    };
  }

  if (settings.pairMethod === 'ranking') {
    const pairs = rankingPartnerPairs(ranked, mixed);
    const matches = pairsToMatches(pairs);
    let warning = '';
    if (mixed && matches.some((m) => !matchIsMixed(playersById, m))) {
      warning = 'Не все пары смешанные — не хватило чередования по полу в рейтинге.';
    }
    return { matches, warning };
  }

  const matches = randomMatches(
    players,
    courts,
    mixed,
    counts,
    playersById,
    rng,
    true,
    ranked.map((p) => p.id),
  );
  if (!matches) throw new Error('Не удалось сгенерировать пары.');
  return { matches, warning: '' };
}

export function formatMatchLine(match, playersById) {
  const name = (id) => playersById.get(id)?.name || id;
  const a = `${name(match.teamA[0])} / ${name(match.teamA[1])}`;
  const b = `${name(match.teamB[0])} / ${name(match.teamB[1])}`;
  return `Корт ${match.court}: ${a} — ${b}`;
}
