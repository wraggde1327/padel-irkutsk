import { tallySets } from '@padel/shared';
import type { User } from '@prisma/client';
import { fail } from './errors';
import { prisma } from './prisma';
import { serializeMatch } from './presenters';
import { recalcStandings } from './sandbox';

const matchInclude = {
  sets: true,
  sideA: { include: { entries: { include: { entry: { include: { captain: true, partner: true } } } } } },
  sideB: { include: { entries: { include: { entry: { include: { captain: true, partner: true } } } } } },
  round: true,
  division: true,
} as const;

export function validatePadelSets(sets: Array<{ gamesA: number; gamesB: number }>) {
  if (sets.length < 2 || sets.length > 3) fail(400, 'SETS', 'Нужно 2 или 3 сета');
  let a = 0;
  let b = 0;
  for (const set of sets) {
    if (set.gamesA === set.gamesB) fail(400, 'SETS', 'В сете не может быть ничьей');
    if (set.gamesA > set.gamesB) a += 1;
    else b += 1;
  }
  if (Math.max(a, b) < 2) fail(400, 'SETS', 'Победа до двух сетов — добавьте сет');
  if (a === b) fail(400, 'SETS', 'Некорректный счёт сетов');
  if (sets.length === 3 && (a === 3 || b === 3)) fail(400, 'SETS', 'Третий сет не нужен при 2:0');
  return { winner: a > b ? ('A' as const) : ('B' as const) };
}

export async function userEntryIds(userId: string, tournamentId?: string) {
  const entries = await prisma.entry.findMany({
    where: {
      OR: [{ captainId: userId }, { partnerId: userId }],
      ...(tournamentId ? { tournamentId } : {}),
    },
    select: { id: true, tournamentId: true },
  });
  return entries;
}

export async function submitMatchResult(matchId: string, user: User, sets: Array<{ gamesA: number; gamesB: number }>) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      sideA: { include: { entries: true } },
      sideB: { include: { entries: true } },
      round: true,
    },
  });
  if (!match) fail(404, 'NOT_FOUND', 'Матч не найден');
  if (match.status === 'BYE' || !match.sideBId) fail(409, 'BYE', 'Это бай — счёт не нужен');
  if (!['SCHEDULED', 'RESULT_SUBMITTED', 'DISPUTED'].includes(match.status)) {
    fail(409, 'CLOSED', 'Этот матч уже закрыт');
  }
  const myEntries = await userEntryIds(user.id, match.tournamentId);
  const myIds = new Set(myEntries.map((row) => row.id));
  const onMatch = [...match.sideA.entries, ...(match.sideB?.entries ?? [])].some((row) => myIds.has(row.entryId));
  if (!onMatch && user.role === 'PLAYER') fail(403, 'FORBIDDEN', 'Это не ваш матч');
  const { winner } = validatePadelSets(sets);

  await prisma.matchSet.deleteMany({ where: { matchId } });
  await prisma.matchSet.createMany({
    data: sets.map((set, index) => ({
      matchId,
      number: index + 1,
      gamesA: set.gamesA,
      gamesB: set.gamesB,
    })),
  });

  const updated = await prisma.match.update({
    where: { id: matchId },
    data: {
      status: 'CONFIRMED',
      winnerSideId: winner === 'A' ? match.sideAId : match.sideBId,
      resultSource: user.role === 'PLAYER' ? 'PLAYER_CONFIRMED' : 'ADMIN',
      submittedById: user.id,
      submittedAt: new Date(),
      confirmedById: user.id,
      confirmedAt: new Date(),
      playedAt: new Date(),
    },
    include: matchInclude,
  });

  if (match.round.stage === 'QUALIFICATION') {
    await recalcStandings(match.tournamentId);
  }

  return serializeMatch(updated);
}

export function isPlayedStatus(status: string) {
  return ['CONFIRMED', 'BYE', 'TECH_LOSS'].includes(status);
}
