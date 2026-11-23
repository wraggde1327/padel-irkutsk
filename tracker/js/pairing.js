import { shuffle } from './rng.js';
import { countedGames, gamesSum } from './scoring.js';
import { rankPlayers } from './standings.js';
import { nextFormatRound } from './formats.js';
import {
  bestPairingOfFour,
  expectedPlayerCount,
  formatMatchLine,
  genderCounts,
  idsOf,
  matchIsMixed,
  partnerCounts,
  partnerKey,
  playersByIdMap,
  rankingPartnerPairs,
  pairsToMatches,
} from './pairs.js';

export {
  bestPairingOfFour,
  expectedPlayerCount,
  formatMatchLine,
  genderCounts,
  partnerCounts,
  partnerKey,
  pairingsOfFour,
  rankingPartnerPairs,
  pairsToMatches,
} from './pairs.js';

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
      score +=
        ((counts.get(partnerKey(pairing.teamA[0], pairing.teamA[1])) || 0) +
          (counts.get(partnerKey(pairing.teamB[0], pairing.teamB[1])) || 0)) *
        100;
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

/** Старое движение «оба победителя вверх» — для свободного режима. */
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

function assertRoster(players, settings) {
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
}

function freeRound({ players, settings, standings, rounds, courtGroups, rng }) {
  const courts = Number(settings.courts) || 2;
  const mixed = settings.pairType === 'mixed';
  const playersById = playersByIdMap(players);
  const counts = partnerCounts(rounds);
  const ranked = rankPlayers(players, standings);
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

function overrideRound({ players, settings, standings, rounds, method, rankMode, rng }) {
  const courts = Number(settings.courts) || 2;
  const playersById = playersByIdMap(players);
  const counts = partnerCounts(rounds);
  const ranked = rankPlayers(players, standings, method === 'ranking' ? rankMode || 'points' : 'delta');
  if (method === 'ranking') {
    const pairs = rankingPartnerPairs(ranked, false);
    return { matches: pairsToMatches(pairs), warning: '', override: true };
  }
  if (method === 'mixed') {
    const matches = randomMatches(players, courts, true, counts, playersById, rng, true, ranked.map((p) => p.id));
    if (!matches) throw new Error('Не удалось собрать смешанные пары.');
    return { matches, warning: '', override: true };
  }
  const matches = randomMatches(players, courts, false, counts, playersById, rng, true, ranked.map((p) => p.id));
  if (!matches) throw new Error('Не удалось сгенерировать пары.');
  return { matches, warning: '', override: true };
}

export function generateRound({
  players,
  settings,
  standings = [],
  rounds = [],
  kind = 'regular',
  courtGroups = null,
  method = null,
  rankMode = 'points',
  rng = Math.random,
}) {
  assertRoster(players, settings);
  const mixed = settings.pairType === 'mixed';
  const playersById = playersByIdMap(players);

  if (kind === 'qualifying') {
    const courts = Number(settings.courts) || 2;
    return {
      matches: qualifyingMatches(players, courts, mixed, playersById, rng),
      warning: '',
      format: 'qualifying',
    };
  }

  if (method === 'ranking' || method === 'random' || method === 'mixed') {
    return overrideRound({ players, settings, standings, rounds, method, rankMode, rng });
  }

  const format = settings.tournamentFormat || 'free';
  if (format && format !== 'free') {
    const result = nextFormatRound({
      players,
      settings,
      standings,
      rounds,
      courtGroups,
      rng,
    });
    if (result) return result;
  }

  return freeRound({ players, settings, standings, rounds, courtGroups, rng });
}
