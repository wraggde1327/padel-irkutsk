import { countedGames, gamesSum } from './scoring.js';
import { rankPlayers } from './standings.js';
import { shuffle } from './rng.js';
import {
  bestPairingOfFour,
  emptyMatch,
  pairingsOfFour,
  partnerCounts,
  partnerKey,
  playersByIdMap,
} from './pairs.js';

export const FORMAT_OPTIONS = [
  {
    id: 'free',
    title: 'Свободный',
    hint: 'Закреплённые пары играют с ближайшими по силе соперниками, либо каждый круг новые 1+последний.',
  },
  {
    id: 'americano',
    title: 'Американо',
    hint: 'Каждый играет с каждым в напарниках по кругу, очки личные. Если игроков не кратно 4 — лишние сидят круг.',
  },
  {
    id: 'mexicano',
    title: 'Мексикано',
    hint: 'После круга всех сортируют по разнице очков: топ-4 на корт 1, следующие на корт 2 и ниже.',
  },
  {
    id: 'escalera',
    title: 'Эскалера',
    hint: 'На корте трое: каждый с каждым (AB–CD, AC–BD, AD–BC). Двое лучших вверх, двое худших вниз.',
  },
  {
    id: 'king',
    title: 'Кинг',
    hint: 'После матча лучший из победителей поднимается, слабый из проигравших опускается; на корте снова меняют пары.',
  },
];

export function formatTitle(id) {
  return FORMAT_OPTIONS.find((f) => f.id === id)?.title || 'Свободный';
}

function mixedWanted(settings) {
  return settings.pairType === 'mixed';
}

function pairFour(ids, players, settings, rounds, rng, preferStyle) {
  const playersById = playersByIdMap(players);
  const mixed = mixedWanted(settings);
  const tryStyled = (teamA, teamB) => {
    if (!mixed || (isMixedPair(playersById, teamA) && isMixedPair(playersById, teamB))) {
      return { teamA, teamB };
    }
    return null;
  };
  if (preferStyle === '1-3' || preferStyle === '1-4') {
    const primary =
      preferStyle === '1-3'
        ? tryStyled([ids[0], ids[2]], [ids[1], ids[3]])
        : tryStyled([ids[0], ids[3]], [ids[1], ids[2]]);
    if (primary) return primary;
    const secondary =
      preferStyle === '1-3'
        ? tryStyled([ids[0], ids[3]], [ids[1], ids[2]])
        : tryStyled([ids[0], ids[2]], [ids[1], ids[3]]);
    if (secondary) return secondary;
  }
  return bestPairingOfFour(ids, playersById, partnerCounts(rounds), mixed, rng);
}

function isMixedPair(playersById, ids) {
  const g0 = playersById.get(ids[0])?.gender;
  const g1 = playersById.get(ids[1])?.gender;
  return Boolean(g0 && g1 && g0 !== g1);
}

function lastPartnersOnCourt(matches, court) {
  const ofCourt = matches.filter((m) => m.court === court);
  const last = ofCourt[ofCourt.length - 1];
  if (!last) return new Set();
  return new Set([partnerKey(last.teamA[0], last.teamA[1]), partnerKey(last.teamB[0], last.teamB[1])]);
}

function pairAvoidingLast(ids, players, settings, rounds, rng, lastKeys) {
  const playersById = playersByIdMap(players);
  const mixed = mixedWanted(settings);
  const counts = partnerCounts(rounds);
  const options = pairingsOfFour(ids);
  const scored = options.map((opt) => {
    const keys = [partnerKey(opt.teamA[0], opt.teamA[1]), partnerKey(opt.teamB[0], opt.teamB[1])];
    const lastHit = lastKeys && keys.some((k) => lastKeys.has(k)) ? 50 : 0;
    const mixPenalty = mixed && !(isMixedPair(playersById, opt.teamA) && isMixedPair(playersById, opt.teamB)) ? 80 : 0;
    const repeats =
      (counts.get(keys[0]) || 0) + (counts.get(keys[1]) || 0);
    return { opt, score: lastHit + mixPenalty + repeats * 10 + rng() * 0.01 };
  });
  scored.sort((a, b) => a.score - b.score);
  return scored[0].opt;
}

function americanoFactors(active) {
  const m = active.length;
  if (m < 4 || m % 4 !== 0) return [];
  const rounds = [];
  const inf = m - 1;
  const mod = m - 1;
  for (let r = 0; r < m - 1; r += 1) {
    const pairs = [[active[inf], active[r]]];
    for (let j = 1; j < m / 2; j += 1) {
      const a = (r + j) % mod;
      const b = (r - j + mod) % mod;
      pairs.push([active[a], active[b]]);
    }
    const half = pairs.length / 2;
    const second = pairs.slice(half);
    const rot = r % Math.max(1, half);
    for (let k = 0; k < rot; k += 1) second.push(second.shift());
    const matches = [];
    for (let i = 0; i < half; i += 1) {
      matches.push(emptyMatch(i + 1, pairs[i], second[i]));
    }
    rounds.push({ matches, sitting: [] });
  }
  return rounds;
}

/**
 * 1-факторизация K_n: каждый с каждым в напарниках один раз.
 * Если игроков не кратно 4, лишние по очереди сидят круг.
 */
export function americanoSchedule(playerIds) {
  if (playerIds.length < 4) return [];
  const sitCount = playerIds.length % 4;
  if (sitCount === 0) return americanoFactors(playerIds);
  const rounds = [];
  for (let r = 0; r < playerIds.length; r += 1) {
    const rotated = playerIds.slice(r).concat(playerIds.slice(0, r));
    const sitting = rotated.slice(0, sitCount);
    const playing = rotated.slice(sitCount);
    const inner = americanoFactors(playing);
    if (!inner.length) break;
    const slot = inner[r % inner.length];
    rounds.push({ matches: slot.matches, sitting });
  }
  return rounds;
}

/** Смешанное американо: только М+Ж, число кругов = числу Ж (при равных составах). */
export function americanoMixedSchedule(players) {
  const men = players.filter((p) => p.gender !== 'F');
  const women = players.filter((p) => p.gender === 'F');
  const k = Math.min(men.length, women.length);
  if (k < 2) return [];
  const extra = [...men.slice(k), ...women.slice(k)].map((p) => p.id);
  const rounds = [];
  for (let r = 0; r < k; r += 1) {
    const pairs = [];
    for (let i = 0; i < k; i += 1) {
      pairs.push([men[i].id, women[(i + r) % k].id]);
    }
    const matches = [];
    for (let i = 0; i < pairs.length / 2; i += 1) {
      matches.push(emptyMatch(i + 1, pairs[i], pairs[pairs.length - 1 - i]));
    }
    rounds.push({ matches, sitting: extra.slice() });
  }
  return rounds;
}

function freezeAmericanoOrder(players, standings, rounds, settings) {
  const prev = rounds.find((r) => r.kind === 'regular' && r.format === 'americano' && r.playerOrder?.length);
  if (prev) {
    const byId = playersByIdMap(players);
    const ordered = prev.playerOrder.map((id) => byId.get(id)).filter(Boolean);
    for (const p of players) {
      if (!ordered.some((x) => x.id === p.id)) ordered.push(p);
    }
    return ordered;
  }
  if (rounds.some((r) => r.kind === 'qualifying')) {
    return rankPlayers(players, standings, settings?.standingsSort === 'wins' ? 'wins' : 'points');
  }
  return players.slice();
}

export function nextAmericanoRound({ players, settings, standings, rounds }) {
  const ordered = freezeAmericanoOrder(players, standings, rounds, settings);
  const mixed = mixedWanted(settings);
  const schedule = mixed ? americanoMixedSchedule(ordered) : americanoSchedule(ordered.map((p) => p.id));
  if (!schedule.length) {
    throw new Error('Недостаточно игроков для американо.');
  }
  const played = rounds.filter((r) => r.kind === 'regular' && r.format === 'americano' && !r.override).length;
  const slot = schedule[played % schedule.length];
  const wrapped = played > 0 && played % schedule.length === 0;
  const sitNames = (slot.sitting || [])
    .map((id) => ordered.find((p) => p.id === id)?.name || id)
    .join(', ');
  return {
    matches: slot.matches.map((m) => ({ ...m, games: [] })),
    sitting: slot.sitting || [],
    playerOrder: ordered.map((p) => p.id),
    warning: wrapped ? 'Полный цикл американо завершён — пары пошли по второму кругу.' : '',
    note: slot.sitting?.length ? `Не играют: ${sitNames}` : '',
  };
}

export function mexicanoMatches({ players, settings, standings, rounds, rng }) {
  const ranked = rankPlayers(players, standings, 'delta');
  const courts = Number(settings.courts) || 2;
  const style = settings.mexicanoPairing === '1-3' ? '1-3' : '1-4';
  const hadRegular = rounds.some((r) => r.kind === 'regular');
  const hadQual = rounds.some((r) => r.kind === 'qualifying');
  let ordered = ranked;
  if (!hadRegular && !hadQual) {
    ordered = shuffle(players.slice(), rng);
  }
  const matches = [];
  let warning = '';
  for (let c = 0; c < courts; c += 1) {
    const group = ordered.slice(c * 4, c * 4 + 4);
    if (group.length < 4) break;
    const pairing = pairFour(
      group.map((p) => p.id),
      players,
      settings,
      rounds,
      rng,
      style,
    );
    matches.push(emptyMatch(c + 1, pairing.teamA, pairing.teamB));
    if (mixedWanted(settings)) {
      const byId = playersByIdMap(players);
      if (!(isMixedPair(byId, pairing.teamA) && isMixedPair(byId, pairing.teamB))) {
        warning = 'На части кортов не удалось собрать только М+Ж — состав четвёрки не позволяет.';
      }
    }
  }
  return { matches, warning, note: 'Группы по рейтингу Δ, затем победы.' };
}

export function escaleraMatches({ players, settings, standings, rounds, courtGroups, rng }) {
  const courts = Number(settings.courts) || 2;
  const ranked = rankPlayers(players, standings, 'delta');
  const hadQual = rounds.some((r) => r.kind === 'qualifying');
  const hadRegular = rounds.some((r) => r.kind === 'regular' && r.format === 'escalera');
  let groups = courtGroups;
  if (!groups || groups.length !== courts) {
    let pool = ranked;
    if (!hadRegular && !hadQual) pool = shuffle(players.slice(), rng);
    else if (!hadRegular && hadQual) pool = ranked;
    groups = [];
    const ids = pool.map((p) => p.id);
    if (mixedWanted(settings) && !hadRegular) {
      groups = mixedCourtGroups(pool, courts, rng) || [];
    }
    if (groups.length !== courts) {
      groups = [];
      for (let c = 0; c < courts; c += 1) groups.push(ids.slice(c * 4, c * 4 + 4));
    }
  }
  const matches = [];
  groups.forEach((ids, c) => {
    const ordered = ids.slice(0, 4);
    pairingsOfFour(ordered).forEach((opt, seq) => {
      matches.push(emptyMatch(c + 1, opt.teamA, opt.teamB, { sequence: seq + 1 }));
    });
  });
  return { matches, warning: '', note: 'На каждом корте 3 смены пар.', courtGroups: groups };
}

function mixedCourtGroups(players, courts, rng) {
  const men = shuffle(
    players.filter((p) => p.gender !== 'F'),
    rng,
  );
  const women = shuffle(
    players.filter((p) => p.gender === 'F'),
    rng,
  );
  if (men.length < courts * 2 || women.length < courts * 2) return null;
  const groups = [];
  for (let c = 0; c < courts; c += 1) {
    groups.push([men[c * 2].id, men[c * 2 + 1].id, women[c * 2].id, women[c * 2 + 1].id]);
  }
  return groups;
}

function playerPointsOnCourt(playerId, matches, settings, kind) {
  let pointsFor = 0;
  let pointsAgainst = 0;
  let wins = 0;
  let losses = 0;
  for (const match of matches) {
    const games = countedGames({ ...match, kind }, settings);
    const sum = gamesSum(games);
    const onA = match.teamA.includes(playerId);
    const onB = match.teamB.includes(playerId);
    if (!onA && !onB) continue;
    const scored = onA ? sum.a : sum.b;
    const conceded = onA ? sum.b : sum.a;
    pointsFor += scored;
    pointsAgainst += conceded;
    if (scored > conceded) wins += 1;
    else if (scored < conceded) losses += 1;
  }
  return { id: playerId, pointsFor, pointsAgainst, delta: pointsFor - pointsAgainst, wins, losses };
}

function rankFourOnCourt(ids, matches, settings, kind) {
  return ids
    .map((id) => playerPointsOnCourt(id, matches, settings, kind))
    .sort((a, b) => {
      if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
      if (b.delta !== a.delta) return b.delta - a.delta;
      if (b.wins !== a.wins) return b.wins - a.wins;
      return String(a.id).localeCompare(String(b.id));
    });
}

/** Двое лучших вверх, двое худших вниз. Верхний корт держит лучших, нижний — худших. */
export function escaleraMove(matches, settings, kind, groups) {
  const courts = groups.length;
  const perCourt = groups.map((ids, i) => {
    const courtMatches = matches.filter((m) => m.court === i + 1);
    const ranked = rankFourOnCourt(ids, courtMatches, settings, kind);
    return {
      top: ranked.slice(0, 2).map((r) => r.id),
      bottom: ranked.slice(2).map((r) => r.id),
    };
  });
  const next = Array.from({ length: courts }, () => []);
  const movement = [];
  if (courts === 1) {
    next[0] = [...perCourt[0].top, ...perCourt[0].bottom];
  } else {
    next[0] = [...perCourt[0].top, ...perCourt[1].top];
    movement.push(
      ...perCourt[1].top.map((id) => ({ id, from: 2, to: 1, reason: 'лучшие с корта 2 вверх' })),
      ...perCourt[0].bottom.map((id) => ({ id, from: 1, to: 2, reason: 'худшие с корта 1 вниз' })),
    );
    next[courts - 1] = [...perCourt[courts - 2].bottom, ...perCourt[courts - 1].bottom];
    if (courts === 2) {
      next[1] = [...perCourt[0].bottom, ...perCourt[1].bottom];
    } else {
      next[1] = [...perCourt[0].bottom, ...perCourt[courts - 1].top];
      movement.push(
        ...perCourt[courts - 1].top.map((id) => ({
          id,
          from: courts,
          to: 2,
          reason: 'лучшие нижнего корта вверх',
        })),
        ...perCourt[1].bottom.map((id) => ({ id, from: 2, to: courts, reason: 'худшие среднего корта вниз' })),
      );
      next[2] = [...perCourt[1].bottom, ...perCourt[2].bottom];
    }
  }
  return { groups: next, movement };
}

export function nextEscaleraRound(args) {
  const { rounds, settings, players, standings, rng } = args;
  const last = [...rounds].reverse().find((r) => r.kind === 'regular' && r.format === 'escalera');
  let courtGroups = null;
  let note = '';
  if (last?.courtGroups) {
    const moved = escaleraMove(last.matches, settings, last.kind, last.courtGroups);
    courtGroups = moved.groups;
    note = describeMovement(moved.movement, players);
  }
  const result = escaleraMatches({ players, settings, standings, rounds, courtGroups, rng });
  return { ...result, note: [result.note, note].filter(Boolean).join(' ') };
}

function describeMovement(movement, players) {
  if (!movement?.length) return '';
  const byId = playersByIdMap(players);
  const name = (id) => byId.get(id)?.name || id;
  const up = movement.filter((m) => m.to < m.from);
  const down = movement.filter((m) => m.to > m.from);
  const parts = [];
  if (up.length) parts.push(`↑ ${up.map((m) => `${name(m.id)}→${m.to}`).join(', ')}`);
  if (down.length) parts.push(`↓ ${down.map((m) => `${name(m.id)}→${m.to}`).join(', ')}`);
  return parts.join(' · ');
}

function matchWinnerLoserIds(match, settings, kind) {
  const games = countedGames({ ...match, kind }, settings);
  const sum = gamesSum(games);
  if (sum.a > sum.b) return { winners: match.teamA.slice(), losers: match.teamB.slice(), sum };
  if (sum.b > sum.a) return { winners: match.teamB.slice(), losers: match.teamA.slice(), sum };
  return { winners: match.teamA.slice(), losers: match.teamB.slice(), sum };
}

function betterPlayer(ids, standings, players) {
  const ranked = rankPlayers(
    ids.map((id) => players.find((p) => p.id === id) || { id, name: id, gender: 'M' }),
    standings,
    'delta',
  );
  return ranked[0].id;
}

function worsePlayer(ids, standings, players) {
  const ranked = rankPlayers(
    ids.map((id) => players.find((p) => p.id === id) || { id, name: id, gender: 'M' }),
    standings,
    'delta',
  );
  return ranked[ranked.length - 1].id;
}

/**
 * Один вверх, один вниз: лучший из победителей поднимается (на верхнем корте остаётся),
 * худший из проигравших опускается (на нижнем остаётся).
 */
export function kingMove(matches, settings, kind, standings, players) {
  const ordered = matches.slice().sort((a, b) => a.court - b.court);
  const n = ordered.length;
  const next = Array.from({ length: n }, () => []);
  const movement = [];
  const details = [];
  for (let i = 0; i < n; i += 1) {
    const match = ordered[i];
    const { winners, losers } = matchWinnerLoserIds(match, settings, kind);
    const upId = betterPlayer(winners, standings, players);
    const downId = worsePlayer(losers, standings, players);
    const stay = [...match.teamA, ...match.teamB].filter((id) => id !== upId && id !== downId);
    const upCourt = i === 0 ? 0 : i - 1;
    const downCourt = i === n - 1 ? n - 1 : i + 1;
    next[upCourt].push(upId);
    next[downCourt].push(downId);
    next[i].push(...stay);
    details.push({
      court: i + 1,
      upId,
      downId,
      stay,
      upCourt: upCourt + 1,
      downCourt: downCourt + 1,
    });
    if (upCourt !== i) movement.push({ id: upId, from: i + 1, to: upCourt + 1, reason: 'лучший из победителей' });
    if (downCourt !== i) movement.push({ id: downId, from: i + 1, to: downCourt + 1, reason: 'слабее из проигравших' });
  }
  return { groups: next, movement, details };
}

function lastPartnerKeysForIds(ids, rounds) {
  const keys = new Set();
  const idSet = new Set(ids);
  const last = [...rounds].reverse().find((r) => r.matches?.length);
  if (!last) return keys;
  for (const match of last.matches) {
    for (const team of [match.teamA, match.teamB]) {
      if (idSet.has(team[0]) && idSet.has(team[1])) keys.add(partnerKey(team[0], team[1]));
    }
  }
  return keys;
}

export function kingMatches({ players, settings, rounds, courtGroups, rng }) {
  const courts = Number(settings.courts) || 2;
  const matches = courtGroups.map((ids, i) => {
    const lastKeys = lastPartnerKeysForIds(ids, rounds);
    const courtLast = lastPartnersOnCourt(
      rounds.flatMap((r) => r.matches),
      i + 1,
    );
    courtLast.forEach((k) => lastKeys.add(k));
    const pairing = pairAvoidingLast(ids, players, settings, rounds, rng, lastKeys);
    return emptyMatch(i + 1, pairing.teamA, pairing.teamB);
  });
  if (matches.length !== courts) {
    throw new Error('Для кинга на каждом корте должно быть 4 игрока.');
  }
  return { matches, warning: '' };
}

export function nextKingRound({ players, settings, standings, rounds, rng }) {
  const last = [...rounds].reverse().find((r) => r.kind === 'regular');
  const courts = Number(settings.courts) || 2;
  let groups;
  let note = '';
  if (last && last.matches.length) {
    const sourceGroups =
      last.courtGroups ||
      Array.from({ length: courts }, (_, c) => {
        const m = last.matches.find((x) => x.court === c + 1);
        return m ? [...m.teamA, ...m.teamB] : [];
      });
    const moved = kingMove(last.matches, settings, last.kind, standings, players);
    groups = moved.groups;
    note = kingNote(moved.details, players);
    if (groups.some((g) => g.length !== 4)) {
      groups = sourceGroups;
      note = 'Не удалось сдвинуть игроков — повтор той же раскладки кортов.';
    }
  } else {
    const ranked = rankPlayers(players, standings, 'delta');
    const pool = rounds.some((r) => r.kind === 'qualifying') ? ranked : shuffle(players.slice(), rng);
    groups = [];
    if (mixedWanted(settings)) {
      groups = mixedCourtGroups(pool, courts, rng) || [];
    }
    if (groups.length !== courts) {
      const ids = pool.map((p) => p.id);
      groups = [];
      for (let c = 0; c < courts; c += 1) groups.push(ids.slice(c * 4, c * 4 + 4));
    }
  }
  const result = kingMatches({ players, settings, rounds, courtGroups: groups, rng });
  return { ...result, note, courtGroups: groups };
}

function kingNote(details, players) {
  const byId = playersByIdMap(players);
  const name = (id) => byId.get(id)?.name || id;
  return details
    .map((d) => {
      const up = d.upCourt === d.court ? `${name(d.upId)} остаётся` : `${name(d.upId)}↑${d.upCourt}`;
      const down = d.downCourt === d.court ? `${name(d.downId)} остаётся` : `${name(d.downId)}↓${d.downCourt}`;
      return `Корт ${d.court}: ${up}, ${down}`;
    })
    .join('. ');
}

export function nextFormatRound(args) {
  const format = args.settings.tournamentFormat || 'free';
  if (format === 'americano') return { ...nextAmericanoRound(args), format };
  if (format === 'mexicano') return { ...mexicanoMatches(args), format };
  if (format === 'escalera') return { ...nextEscaleraRound(args), format };
  if (format === 'king') return { ...nextKingRound(args), format };
  return null;
}
