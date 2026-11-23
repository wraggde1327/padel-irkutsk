/** Закреплённые пары, сила соперников, смена пар. */

import { shuffle } from './rng.js';
import { rankPlayers, standingOf } from './standings.js';
import {
  emptyMatch,
  genderCounts,
  partnerCounts,
  partnerKey,
  playersByIdMap,
  rankingPartnerPairs,
} from './pairs.js';

export const PAIR_CHANGE_METHODS = [
  {
    id: 'ranking',
    title: 'По рейтингу 1–8',
    hint: 'Первый с последним, второй с предпоследним — без учёта пола.',
  },
  {
    id: 'ranking-mixed',
    title: 'По рейтингу с М+Ж',
    hint: 'Сильный М со слабой Ж и наоборот: пары ближе к середине, каждая М+Ж.',
  },
  {
    id: 'rotate-mixed',
    title: 'Следующая М+Ж',
    hint: 'Новый партнёр противоположного пола, кого ещё не было. Очки не смотрим.',
  },
  {
    id: 'random',
    title: 'Случайно',
    hint: 'Случайные пары, меньше повторов. Если включено М+Ж — только смешанные.',
  },
];

export function pairKey(pair) {
  return partnerKey(pair[0], pair[1]);
}

export function opponentKey(pairA, pairB) {
  const a = pairKey(pairA);
  const b = pairKey(pairB);
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** 1-факторизация K_n для чётного числа команд: каждый с каждым один раз. */
export function teamMatchFactors(n) {
  if (n < 2 || n % 2 !== 0) return [];
  const inf = n - 1;
  const mod = n - 1;
  const rounds = [];
  for (let r = 0; r < n - 1; r += 1) {
    const edges = [[inf, r]];
    for (let j = 1; j < n / 2; j += 1) {
      const a = (r + j) % mod;
      const b = (r - j + mod) % mod;
      edges.push([a, b]);
    }
    rounds.push(edges);
  }
  return rounds;
}

export function rankingMixedBalanced(ranked) {
  const men = ranked.filter((p) => p.gender !== 'F');
  const women = ranked.filter((p) => p.gender === 'F');
  const n = Math.min(men.length, women.length);
  const pairs = [];
  for (let i = 0; i < n; i += 1) {
    pairs.push([men[i], women[n - 1 - i]]);
  }
  return pairs;
}

export function rotateMixedPairs(players, counts, rng = Math.random) {
  const men = players.filter((p) => p.gender !== 'F');
  const women = players.filter((p) => p.gender === 'F');
  if (men.length !== women.length || men.length < 2) return [];
  let best = null;
  let bestScore = Infinity;
  for (let attempt = 0; attempt < 240; attempt += 1) {
    const left = shuffle(women.slice(), rng);
    const used = new Set();
    const pairs = [];
    let score = 0;
    let ok = true;
    for (const man of shuffle(men.slice(), rng)) {
      let pick = -1;
      let pickScore = Infinity;
      for (let i = 0; i < left.length; i += 1) {
        if (used.has(i)) continue;
        const k = partnerKey(man.id, left[i].id);
        const s = counts.get(k) || 0;
        if (s < pickScore) {
          pickScore = s;
          pick = i;
        }
      }
      if (pick < 0) {
        ok = false;
        break;
      }
      used.add(pick);
      score += pickScore * 100;
      pairs.push([man, left[pick]]);
    }
    if (!ok) continue;
    if (score < bestScore) {
      bestScore = score;
      best = pairs;
    }
  }
  return best || [];
}

export function randomPartnerPairs(players, mixed, counts, rng = Math.random) {
  const need = players.length / 2;
  let best = null;
  let bestScore = Infinity;
  for (let attempt = 0; attempt < 360; attempt += 1) {
    const shuffled = shuffle(players.slice(), rng);
    const pairs = [];
    let score = 0;
    let ok = true;
    if (mixed) {
      const men = shuffled.filter((p) => p.gender !== 'F');
      const women = shuffled.filter((p) => p.gender === 'F');
      if (men.length !== women.length) ok = false;
      else {
        for (let i = 0; i < men.length; i += 1) {
          pairs.push([men[i], women[i]]);
          score += (counts.get(partnerKey(men[i].id, women[i].id)) || 0) * 100;
        }
      }
    } else {
      for (let i = 0; i + 1 < shuffled.length; i += 2) {
        pairs.push([shuffled[i], shuffled[i + 1]]);
        score += (counts.get(partnerKey(shuffled[i].id, shuffled[i + 1].id)) || 0) * 100;
      }
    }
    if (!ok || pairs.length !== need) continue;
    if (score < bestScore) {
      bestScore = score;
      best = pairs;
    }
  }
  return best || [];
}

export function formPairs({ method, players, standings, rounds, settings, rng = Math.random }) {
  const mixedOn = settings.pairType === 'mixed';
  const { m, f } = genderCounts(players);
  const canMixed = m === f && m > 0;
  const rankMode = settings.standingsSort === 'wins' ? 'wins' : 'points';
  const ranked = rankPlayers(players, standings, rankMode);
  const counts = partnerCounts(rounds);
  if (method === 'ranking-mixed') {
    if (!canMixed) throw new Error('Для М+Ж нужно поровну мужчин и женщин.');
    return rankingMixedBalanced(ranked);
  }
  if (method === 'rotate-mixed') {
    if (!canMixed) throw new Error('Для М+Ж нужно поровну мужчин и женщин.');
    const pairs = rotateMixedPairs(players, counts, rng);
    if (!pairs.length) throw new Error('Не удалось подобрать новые пары М+Ж.');
    return pairs;
  }
  if (method === 'random') {
    const pairs = randomPartnerPairs(players, mixedOn && canMixed, counts, rng);
    if (!pairs.length) throw new Error('Не удалось собрать случайные пары.');
    return pairs;
  }
  if (mixedOn && canMixed) return rankingMixedBalanced(ranked);
  return rankingPartnerPairs(ranked, false);
}

export function blockKey(fixedPairs) {
  return (fixedPairs || []).map((p) => pairKey(p)).sort().join(';');
}

export function pairStandingScore(pair, standings, mode) {
  const ids = pair.map((p) => (p && p.id ? p.id : p));
  const a = standingOf(standings, ids[0]);
  const b = standingOf(standings, ids[1]);
  if (mode === 'wins') {
    return a.wins + b.wins + (a.pointsFor + b.pointsFor) * 1e-6 + (a.delta + b.delta) * 1e-9;
  }
  return a.pointsFor + b.pointsFor + (a.wins + b.wins) * 1e-6 + (a.delta + b.delta) * 1e-9;
}

export function lastOpponentKeys(round) {
  const keys = new Set();
  if (!round?.matches) return keys;
  for (const match of round.matches) {
    keys.add(opponentKey(match.teamA, match.teamB));
  }
  return keys;
}

function asIds(pair) {
  return pair.map((p) => (p && typeof p === 'object' ? p.id : p));
}

function edgesToMatches(pairs, edges) {
  const sorted = edges.slice().sort((e1, e2) => Math.min(e1[0], e1[1]) - Math.min(e2[0], e2[1]));
  return sorted.map((edge, i) => emptyMatch(i + 1, asIds(pairs[edge[0]]), asIds(pairs[edge[1]])));
}

/**
 * Соперники по силе: 1-я пара против 2-й на корте 1, 3-я против 4-й на корте 2…
 * Если этот матчап только что был — берём ближайший другой из кругового графика.
 */
export function strengthMatchups(pairs, standings, settings, lastOpp, rng = Math.random) {
  const mode = settings.standingsSort === 'wins' ? 'wins' : 'points';
  const ranked = pairs
    .map((pair) => {
      const ids = pair.map((p) => (p && p.id ? p.id : p));
      return { pair: ids, score: pairStandingScore(ids, standings, mode) };
    })
    .sort((a, b) => b.score - a.score || rng() * 0.001);
  const ordered = ranked.map((r) => r.pair);
  const n = ordered.length;
  const factors = teamMatchFactors(n);
  if (!factors.length) return { matches: [], ordered };

  const scored = factors.map((edges, index) => {
    let dist = 0;
    let repeat = 0;
    for (const [i, j] of edges) {
      dist += Math.abs(i - j);
      if (lastOpp?.has(opponentKey(ordered[i], ordered[j]))) repeat += 1;
    }
    return { edges, index, score: dist + repeat * 1000 };
  });
  scored.sort((a, b) => a.score - b.score || a.index - b.index);
  return { matches: edgesToMatches(ordered, scored[0].edges), ordered, factor: scored[0].edges };
}

/** Круговой график пар: слот 0, 1, … затем сначала. */
export function roundRobinMatchups(pairs, slot) {
  const ids = pairs.map((pair) => pair.map((p) => (p.id ? p.id : p)));
  const factors = teamMatchFactors(ids.length);
  if (!factors.length) return { matches: [], ordered: ids };
  const edges = factors[slot % factors.length];
  return { matches: edgesToMatches(ids, edges), ordered: ids, factor: edges };
}

export function idsToPlayerPairs(pairs, players) {
  const byId = playersByIdMap(players);
  return pairs.map((pair) => pair.map((id) => byId.get(id) || { id, name: id, gender: 'M' }));
}

export function playerPairsToIds(pairs) {
  return pairs.map((pair) => pair.map((p) => (p.id ? p.id : p)));
}

export function nextFreeRound({
  players,
  settings,
  standings,
  rounds,
  fixedPairs,
  method = null,
  rng = Math.random,
}) {
  const locked = (settings.pairLock || 'locked') === 'locked';
  const change = Boolean(method);
  let pairs;
  if (change) {
    pairs = formPairs({ method, players, standings, rounds, settings, rng });
  } else if (!locked || !fixedPairs?.length) {
    const auto = settings.pairType === 'mixed' ? 'ranking-mixed' : 'ranking';
    try {
      pairs = formPairs({ method: auto, players, standings, rounds, settings, rng });
    } catch {
      pairs = formPairs({ method: 'ranking', players, standings, rounds, settings, rng });
    }
  } else {
    pairs = idsToPlayerPairs(fixedPairs, players);
  }

  const idPairs = playerPairsToIds(pairs);
  const last = [...rounds].reverse().find((r) => r.kind === 'regular' && r.fixedPairs?.length);
  const lastOpp =
    !change && locked && last && blockKey(last.fixedPairs) === blockKey(idPairs)
      ? lastOpponentKeys(last)
      : new Set();

  const useRr = locked && settings.lockedMatchups === 'roundrobin' && !change;
  const playedInBlock = useRr
    ? rounds.filter((r) => r.kind === 'regular' && r.format === 'free' && blockKey(r.fixedPairs) === blockKey(idPairs))
        .length
    : 0;
  const result = useRr
    ? roundRobinMatchups(pairs, playedInBlock)
    : strengthMatchups(pairs, standings, settings, lastOpp, rng);

  let note = locked ? 'Пары закреплены · соперники по силе.' : 'Новые пары по таблице 1+последний.';
  if (useRr) note = 'Пары закреплены · круговой график соперников.';
  if (change) note = 'Новые закреплённые пары. Соперники с этого круга — по силе.';
  if (!locked && !change) note = 'Пары пересобраны по рейтингу.';

  return {
    matches: result.matches,
    fixedPairs: idPairs,
    note,
    warning: '',
    format: 'free',
    override: change,
  };
}
