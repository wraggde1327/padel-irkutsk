import {
  bracketSize,
  generateQualDraw,
  hashSeed,
  mulberry32,
  parseTournamentConfig,
  personLabel,
  planDivisions,
  playoffRoundTitle,
  randomPadelSets,
  rankStandings,
  seedOrder,
  TEST_PEOPLE,
  tallySets,
  type StandingRow,
} from '@padel/shared';
import type { User } from '@prisma/client';
import { prisma } from './prisma';

const TEST_ID_START = 20001n;

export async function fillChampionship(tournamentId: string, actor: User | null, target = 30) {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) throw new Error('NO_TOURNAMENT');

  if (actor) {
    const mine = await prisma.entry.findFirst({
      where: { tournamentId, OR: [{ captainId: actor.id }, { partnerId: actor.id }] },
    });
    if (!mine) {
      await createEntry(tournamentId, 'SOLO', actor, null, tournament.feeSoloKopecks, 0.42);
    }
  }

  const existing = await prisma.entry.count({ where: { tournamentId, status: 'ACTIVE' } });
  const need = Math.max(0, target - existing);
  if (need === 0) return { created: 0, total: existing, message: `Уже ${existing} записей` };

  const people = [...TEST_PEOPLE];
  const pairSlots = Math.round(need * 0.6);
  const soloSlots = need - pairSlots;
  let created = 0;
  let cursor = 0;

  const nextUser = async (offset: number) => {
    const person = people[offset % people.length]!;
    const telegramId = TEST_ID_START + BigInt(offset);
    return prisma.user.upsert({
      where: { telegramId },
      update: { firstName: person.firstName, lastName: person.lastName },
      create: {
        telegramId,
        firstName: person.firstName,
        lastName: person.lastName,
        lundaRating: 2 + ((offset * 7) % 35) / 10,
        internalRating: 900 + (offset % 20) * 15,
      },
    });
  };

  for (let i = 0; i < pairSlots; i += 1) {
    const captain = await nextUser(cursor);
    cursor += 1;
    const partner = await nextUser(cursor);
    cursor += 1;
    const already = await prisma.entry.findFirst({ where: { tournamentId, captainId: captain.id } });
    if (already) continue;
    await createEntry(tournamentId, 'PAIR', captain, partner, tournament.feePairKopecks, (i + 1) / 100);
    created += 1;
  }
  for (let i = 0; i < soloSlots; i += 1) {
    const captain = await nextUser(cursor);
    cursor += 1;
    const already = await prisma.entry.findFirst({ where: { tournamentId, captainId: captain.id } });
    if (already) continue;
    await createEntry(tournamentId, 'SOLO', captain, null, tournament.feeSoloKopecks, (pairSlots + i + 1) / 100);
    created += 1;
  }

  const total = await prisma.entry.count({ where: { tournamentId, status: 'ACTIVE' } });
  return { created, total, message: `Добавлено ${created} записей, всего ${total}` };
}

async function createEntry(
  tournamentId: string,
  type: 'PAIR' | 'SOLO',
  captain: User,
  partner: User | null,
  kopecks: number,
  drawLot: number,
) {
  const rating =
    type === 'PAIR' && partner?.lundaRating
      ? (Number(captain.lundaRating ?? 3) + Number(partner.lundaRating)) / 2
      : captain.lundaRating;
  const entry = await prisma.entry.create({
    data: {
      tournamentId,
      type,
      captainId: captain.id,
      partnerId: partner?.id,
      status: 'ACTIVE',
      ratingSnapshot: rating,
    },
  });
  await prisma.payment.create({
    data: {
      entryId: entry.id,
      label: `sandbox-${entry.id}`.slice(0, 64),
      expectedKopecks: kopecks,
      status: 'MANUAL_PAID',
      receivedKopecks: kopecks,
      paidAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000),
      manualReason: 'Тестовое заполнение',
    },
  });
  await prisma.standing.create({
    data: { entryId: entry.id, tournamentId, drawLot },
  });
  return entry;
}

export async function playThrough(tournamentId: string, actor: User | null) {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) throw new Error('NO_TOURNAMENT');
  const config = parseTournamentConfig(tournament.config);
  const random = mulberry32(hashSeed(`play-${tournamentId}-${Date.now()}`));

  const filled = await fillChampionship(tournamentId, actor, tournament.targetEntries || 30);
  await resetCompetition(tournamentId);

  const clubs = await prisma.club.findMany({ where: { isActive: true }, take: 3 });
  const qualRounds = config.qualRounds;
  for (let n = 1; n <= qualRounds; n += 1) {
    await materializeQualRound(tournamentId, n, `qual-${n}-${Date.now()}`, clubs[0]?.id ?? null);
    await playOpenMatches(tournamentId, random, clubs);
    await recalcStandings(tournamentId);
  }

  await publishDivisions(tournamentId);
  await playPlayoffs(tournamentId, random, clubs);
  await prisma.tournament.update({ where: { id: tournamentId }, data: { status: 'PLAYOFF' } });

  const matches = await prisma.match.count({ where: { tournamentId } });
  const entries = await prisma.entry.count({ where: { tournamentId, status: 'ACTIVE' } });
  return {
    ...filled,
    matches,
    entries,
    message: `Сыграно: ${entries} записей, ${matches} матчей, сетка заполнена`,
  };
}

async function resetCompetition(tournamentId: string) {
  await prisma.match.updateMany({
    where: { tournamentId },
    data: { nextMatchId: null, winnerSideId: null, submittedById: null, confirmedById: null },
  });
  await prisma.matchSet.deleteMany({ where: { match: { tournamentId } } });
  await prisma.matchProof.deleteMany({ where: { match: { tournamentId } } });
  await prisma.match.deleteMany({ where: { tournamentId } });
  await prisma.side.deleteMany({ where: { tournamentId } });
  await prisma.round.deleteMany({ where: { tournamentId } });
  await prisma.entry.updateMany({ where: { tournamentId }, data: { divisionId: null, divisionSeed: null } });
  await prisma.payout.deleteMany({ where: { tournamentId } });
  await prisma.division.deleteMany({ where: { tournamentId } });
  await prisma.standing.updateMany({
    where: { tournamentId },
    data: { played: 0, wins: 0, losses: 0, techLosses: 0, byes: 0, setsWon: 0, setsLost: 0, gamesWon: 0, gamesLost: 0, rank: null },
  });
}

export async function materializeQualRound(tournamentId: string, number: number, seed: string, _clubId: string | null) {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) throw new Error('NO_TOURNAMENT');
  const config = parseTournamentConfig(tournament.config);
  const entries = await prisma.entry.findMany({ where: { tournamentId, status: 'ACTIVE' } });
  const history = await loadHistory(tournamentId);
  const preview = generateQualDraw(
    entries.map((entry) => ({ id: entry.id, type: entry.type, byeCount: history.byes.get(entry.id) ?? 0 })),
    { partnered: history.partnered, opposed: history.opposed },
    seed,
  );
  const startsAt = new Date();
  const deadlineAt = new Date(startsAt.getTime() + config.qualRoundDays * 86400000);
  const round = await prisma.round.create({
    data: {
      tournamentId,
      stage: 'QUALIFICATION',
      number,
      title: `Квалификация, тур ${number}`,
      status: 'PUBLISHED',
      startsAt,
      deadlineAt,
      seed,
    },
  });
  const sideMap = new Map<string, string>();
  for (const side of preview.sides) {
    const created = await prisma.side.create({
      data: {
        tournamentId,
        roundId: round.id,
        isTemporary: side.isTemporary,
        entries: { create: side.entryIds.map((entryId) => ({ entryId })) },
      },
    });
    sideMap.set(side.id, created.id);
  }
  for (const match of preview.matches) {
    const sideAId = sideMap.get(match.sideAId)!;
    const sideBId = match.sideBId ? sideMap.get(match.sideBId)! : null;
    await prisma.match.create({
      data: {
        tournamentId,
        roundId: round.id,
        sideAId,
        sideBId,
        status: match.isBye ? 'BYE' : 'SCHEDULED',
        winnerSideId: match.isBye ? sideAId : null,
        deadlineAt,
        originalDeadlineAt: deadlineAt,
        resultSource: match.isBye ? 'ADMIN' : null,
      },
    });
  }
  return { round, preview };
}

async function loadHistory(tournamentId: string) {
  const sides = await prisma.side.findMany({
    where: { tournamentId, round: { stage: 'QUALIFICATION' } },
    include: { entries: true, matchesAsA: true, matchesAsB: true },
  });
  const partnered: Array<[string, string]> = [];
  const opposed: Array<[string, string]> = [];
  const byes = new Map<string, number>();
  for (const side of sides) {
    const ids = side.entries.map((row) => row.entryId);
    if (ids.length === 2) partnered.push([ids[0]!, ids[1]!]);
    const byeMatches = [...side.matchesAsA, ...side.matchesAsB].filter((m) => m.status === 'BYE');
    if (byeMatches.length) {
      for (const id of ids) byes.set(id, (byes.get(id) ?? 0) + byeMatches.length);
    }
  }
  const matches = await prisma.match.findMany({
    where: { tournamentId, round: { stage: 'QUALIFICATION' }, status: { in: ['CONFIRMED', 'BYE'] } },
    include: { sideA: { include: { entries: true } }, sideB: { include: { entries: true } } },
  });
  for (const match of matches) {
    if (!match.sideB) continue;
    for (const a of match.sideA.entries) {
      for (const b of match.sideB.entries) opposed.push([a.entryId, b.entryId]);
    }
  }
  return { partnered, opposed, byes };
}

async function playOpenMatches(
  tournamentId: string,
  random: () => number,
  clubs: Array<{ id: string }>,
) {
  const open = await prisma.match.findMany({
    where: { tournamentId, status: 'SCHEDULED', sideBId: { not: null } },
  });
  for (const match of open) {
    const winner: 'A' | 'B' = random() < 0.5 ? 'A' : 'B';
    const sets = randomPadelSets(random, winner);
    await prisma.matchSet.createMany({
      data: sets.map((set, index) => ({ matchId: match.id, number: index + 1, gamesA: set.gamesA, gamesB: set.gamesB })),
    });
    await prisma.match.update({
      where: { id: match.id },
      data: {
        status: 'CONFIRMED',
        winnerSideId: winner === 'A' ? match.sideAId : match.sideBId,
        resultSource: 'ADMIN',
        clubId: clubs[Math.floor(random() * Math.max(1, clubs.length))]?.id,
        playedAt: new Date(),
        confirmedAt: new Date(),
      },
    });
  }
}

async function recalcStandings(tournamentId: string) {
  const entries = await prisma.entry.findMany({ where: { tournamentId, status: 'ACTIVE' } });
  const matches = await prisma.match.findMany({
    where: { tournamentId, status: { in: ['CONFIRMED', 'BYE'] }, round: { stage: 'QUALIFICATION' } },
    include: { sets: true, sideA: { include: { entries: true } }, sideB: { include: { entries: true } } },
  });
  const rows = new Map<string, StandingRow>();
  const headToHead = new Map<string, string>();
  for (const entry of entries) {
    const standing = await prisma.standing.findUnique({ where: { entryId: entry.id } });
    rows.set(entry.id, {
      entryId: entry.id,
      played: 0,
      wins: 0,
      losses: 0,
      techLosses: 0,
      byes: 0,
      setsWon: 0,
      setsLost: 0,
      gamesWon: 0,
      gamesLost: 0,
      drawLot: standing?.drawLot ?? Math.random(),
    });
  }
  for (const match of matches) {
    const aIds = match.sideA.entries.map((row) => row.entryId);
    const bIds = match.sideB?.entries.map((row) => row.entryId) ?? [];
    const tally = tallySets(match.sets);
    const winnerIsA = match.winnerSideId === match.sideAId;
    if (match.status === 'BYE') {
      for (const id of aIds) {
        const row = rows.get(id);
        if (!row) continue;
        row.played += 1;
        row.wins += 1;
        row.byes += 1;
      }
      continue;
    }
    for (const id of aIds) {
      const row = rows.get(id);
      if (!row) continue;
      row.played += 1;
      if (winnerIsA) row.wins += 1;
      else row.losses += 1;
      row.setsWon += tally.setsA;
      row.setsLost += tally.setsB;
      row.gamesWon += tally.gamesA;
      row.gamesLost += tally.gamesB;
    }
    for (const id of bIds) {
      const row = rows.get(id);
      if (!row) continue;
      row.played += 1;
      if (!winnerIsA) row.wins += 1;
      else row.losses += 1;
      row.setsWon += tally.setsB;
      row.setsLost += tally.setsA;
      row.gamesWon += tally.gamesB;
      row.gamesLost += tally.gamesA;
    }
    if (aIds.length && bIds.length) {
      const a = aIds[0]!;
      const b = bIds[0]!;
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      headToHead.set(key, winnerIsA ? a : b);
    }
  }
  const ranked = rankStandings([...rows.values()], headToHead);
  for (const row of ranked) {
    const data = {
      played: row.played,
      wins: row.wins,
      losses: row.losses,
      techLosses: row.techLosses,
      byes: row.byes,
      setsWon: row.setsWon,
      setsLost: row.setsLost,
      gamesWon: row.gamesWon,
      gamesLost: row.gamesLost,
      drawLot: row.drawLot,
      rank: row.rank,
      tournamentId,
    };
    await prisma.standing.upsert({
      where: { entryId: row.entryId },
      update: data,
      create: { entryId: row.entryId, ...data },
    });
  }
}

async function publishDivisions(tournamentId: string) {
  const config = parseTournamentConfig((await prisma.tournament.findUnique({ where: { id: tournamentId } }))?.config);
  const standings = await prisma.standing.findMany({ where: { tournamentId }, orderBy: { rank: 'asc' } });
  const planned = planDivisions(
    standings.filter((row) => row.rank != null).map((row) => ({ id: row.entryId, rank: row.rank! })),
    config,
  );
  for (const plan of planned) {
    const division = await prisma.division.create({
      data: {
        tournamentId,
        number: plan.number,
        title: plan.title,
        size: plan.entryIds.length,
        published: true,
      },
    });
    for (let i = 0; i < plan.entryIds.length; i += 1) {
      await prisma.entry.update({
        where: { id: plan.entryIds[i] },
        data: { divisionId: division.id, divisionSeed: i + 1 },
      });
    }
  }
  await prisma.tournament.update({ where: { id: tournamentId }, data: { status: 'DIVISIONS_READY' } });
}

async function playPlayoffs(tournamentId: string, random: () => number, clubs: Array<{ id: string }>) {
  const divisions = await prisma.division.findMany({
    where: { tournamentId, published: true },
    include: { entries: { include: { captain: true, partner: true, standing: true } } },
    orderBy: { number: 'asc' },
  });
  for (const division of divisions) {
    const sides = await makePlayoffSides(tournamentId, division.id, division.entries);
    await runBracket(tournamentId, division.id, sides, random, clubs);
  }
}

type SeededSide = { id: string; seed: number };

async function makePlayoffSides(
  tournamentId: string,
  divisionId: string,
  entries: Array<{
    id: string;
    type: 'PAIR' | 'SOLO';
    divisionSeed: number | null;
    captain: { internalRating: number; lundaRating: unknown };
    partner: { internalRating: number } | null;
  }>,
): Promise<SeededSide[]> {
  const sides: SeededSide[] = [];
  const pairs = entries.filter((entry) => entry.type === 'PAIR');
  const solos = [...entries.filter((entry) => entry.type === 'SOLO')].sort(
    (a, b) => Number(b.captain.lundaRating ?? 0) - Number(a.captain.lundaRating ?? 0),
  );
  for (const entry of pairs) {
    const side = await prisma.side.create({
      data: {
        tournamentId,
        divisionId,
        isTemporary: false,
        entries: { create: { entryId: entry.id } },
      },
    });
    sides.push({ id: side.id, seed: entry.divisionSeed ?? 99 });
  }
  for (let i = 0; i < Math.floor(solos.length / 2); i += 1) {
    const strong = solos[i]!;
    const weak = solos[solos.length - 1 - i]!;
    const side = await prisma.side.create({
      data: {
        tournamentId,
        divisionId,
        isTemporary: false,
        entries: { create: [{ entryId: strong.id }, { entryId: weak.id }] },
      },
    });
    sides.push({ id: side.id, seed: Math.min(strong.divisionSeed ?? 99, weak.divisionSeed ?? 99) });
  }
  if (solos.length % 2 === 1) {
    const leftover = solos[Math.floor(solos.length / 2)]!;
    const side = await prisma.side.create({
      data: {
        tournamentId,
        divisionId,
        isTemporary: false,
        entries: { create: { entryId: leftover.id } },
      },
    });
    sides.push({ id: side.id, seed: leftover.divisionSeed ?? 99 });
  }
  return sides.sort((a, b) => a.seed - b.seed);
}

async function runBracket(
  tournamentId: string,
  divisionId: string,
  seeded: SeededSide[],
  random: () => number,
  clubs: Array<{ id: string }>,
) {
  const size = bracketSize(seeded.length);
  const order = seedOrder(size);
  let slots: Array<string | null> = order.map((seed) => seeded[seed - 1]?.id ?? null);
  let remaining = size;
  let number = 1;
  const config = parseTournamentConfig((await prisma.tournament.findUnique({ where: { id: tournamentId } }))?.config);
  while (remaining > 1) {
    const startsAt = new Date();
    const days = remaining <= 2 ? 2 : remaining <= 4 ? config.playoffRoundDays.semi : remaining <= 8 ? config.playoffRoundDays.quarter : config.playoffRoundDays.playIn;
    const deadlineAt = new Date(startsAt.getTime() + days * 86400000);
    const round = await prisma.round.create({
      data: {
        tournamentId,
        stage: 'PLAYOFF',
        divisionId,
        number,
        title: `${playoffRoundTitle(remaining)} · дивизион`,
        status: 'PUBLISHED',
        startsAt,
        deadlineAt,
        seed: `po-${divisionId}-${number}`,
      },
    });
    const winners: Array<string | null> = [];
    for (let i = 0; i < slots.length; i += 2) {
      const a = slots[i] ?? null;
      const b = slots[i + 1] ?? null;
      if (!a && !b) {
        winners.push(null);
        continue;
      }
      if (a && !b) {
        await prisma.match.create({
          data: {
            tournamentId,
            roundId: round.id,
            divisionId,
            sideAId: a,
            sideBId: null,
            status: 'BYE',
            winnerSideId: a,
            deadlineAt,
            originalDeadlineAt: deadlineAt,
            bracketSlot: i / 2,
            resultSource: 'ADMIN',
          },
        });
        winners.push(a);
        continue;
      }
      if (!a && b) {
        await prisma.match.create({
          data: {
            tournamentId,
            roundId: round.id,
            divisionId,
            sideAId: b,
            sideBId: null,
            status: 'BYE',
            winnerSideId: b,
            deadlineAt,
            originalDeadlineAt: deadlineAt,
            bracketSlot: i / 2,
            resultSource: 'ADMIN',
          },
        });
        winners.push(b);
        continue;
      }
      const winner: 'A' | 'B' = random() < 0.5 ? 'A' : 'B';
      const sets = randomPadelSets(random, winner);
      const match = await prisma.match.create({
        data: {
          tournamentId,
          roundId: round.id,
          divisionId,
          sideAId: a!,
          sideBId: b,
          status: 'CONFIRMED',
          winnerSideId: winner === 'A' ? a : b,
          deadlineAt,
          originalDeadlineAt: deadlineAt,
          bracketSlot: i / 2,
          resultSource: 'ADMIN',
          clubId: clubs[Math.floor(random() * Math.max(1, clubs.length))]?.id,
          playedAt: new Date(),
          confirmedAt: new Date(),
        },
      });
      await prisma.matchSet.createMany({
        data: sets.map((set, index) => ({ matchId: match.id, number: index + 1, gamesA: set.gamesA, gamesB: set.gamesB })),
      });
      winners.push(winner === 'A' ? a : b);
    }
    slots = winners;
    remaining = slots.length;
    number += 1;
  }
}

export function formatPerson(user: { firstName: string; lastName: string | null }): string {
  return personLabel(user.firstName, user.lastName);
}
