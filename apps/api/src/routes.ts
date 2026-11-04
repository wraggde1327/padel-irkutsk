import type { FastifyInstance } from 'fastify';
import {
  authDevBodySchema,
  authTelegramBodySchema,
  clubWriteSchema,
  DEFAULT_TOURNAMENT_CONFIG,
  drawGenerateSchema,
  entryWriteSchema,
  generateQualDraw,
  parseTournamentConfig,
  sponsorWriteSchema,
  staffGrantBodySchema,
  tournamentWriteSchema,
} from '@padel/shared';
import { optionalUser, requireOwner, requireStaff, requireUser, signUser, upsertFromTelegram, verifyTelegramInitData } from './auth';
import { env } from './env';
import { fail } from './errors';
import { ru } from './i18n/ru';
import { serializeMatch } from './presenters';
import { prisma } from './prisma';
import { serializeTournament, serializeTournamentCard } from './publicTournament';
import { fillChampionship, materializeQualRound, playThrough } from './sandbox';

async function currentTournament() {
  return prisma.tournament.findFirst({
    orderBy: { createdAt: 'desc' },
    include: { finalsClub: true },
  });
}

async function tournamentById(id?: string) {
  if (id) {
    return prisma.tournament.findUnique({ where: { id }, include: { finalsClub: true } });
  }
  return currentTournament();
}

async function publicTournamentPayload(tournament: NonNullable<Awaited<ReturnType<typeof currentTournament>>>, userId?: string) {
  const [venues, sponsors, paid, entry] = await Promise.all([
    prisma.tournamentClub.findMany({
      where: { tournamentId: tournament.id, club: { isActive: true } },
      include: { club: true },
      orderBy: { club: { sortOrder: 'asc' } },
    }),
    prisma.sponsor.findMany({ where: { tournamentId: tournament.id, isActive: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.payment.findMany({
      where: { entry: { tournamentId: tournament.id }, status: { in: ['PAID', 'MANUAL_PAID'] } },
      select: { expectedKopecks: true },
    }),
    userId
      ? prisma.entry.findFirst({
          where: { tournamentId: tournament.id, OR: [{ captainId: userId }, { partnerId: userId }] },
        })
      : Promise.resolve(null),
  ]);
  return serializeTournament(tournament, {
    clubs: venues.map((row) => row.club),
    sponsors,
    paidKopecks: paid.map((row) => row.expectedKopecks),
    joined: Boolean(entry),
  });
}

const matchInclude = {
  sets: true,
  sideA: { include: { entries: { include: { entry: { include: { captain: true, partner: true } } } } } },
  sideB: { include: { entries: { include: { entry: { include: { captain: true, partner: true } } } } } },
  round: true,
  division: true,
} as const;

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => ({ ok: true, service: 'api' }));

  app.post('/api/v1/auth/telegram', async (request, reply) => {
    const body = authTelegramBodySchema.parse(request.body);
    const data = verifyTelegramInitData(body.initData);
    const user = await upsertFromTelegram({
      telegramId: BigInt(data.user.id),
      firstName: data.user.first_name,
      lastName: data.user.last_name,
      username: data.user.username,
      photoUrl: data.user.photo_url,
      languageCode: data.user.language_code,
      canMessage: data.user.allows_write_to_pm,
    });
    return { token: signUser(reply, user), user: publicUser(user) };
  });

  app.post('/api/v1/auth/dev', async (request, reply) => {
    if (!env.allowDevLogin) fail(403, 'DEV_OFF', ru.devLoginOff);
    const body = authDevBodySchema.parse(request.body);
    if (body.role === 'OWNER' && env.ownerTelegramId && body.telegramId !== env.ownerTelegramId) {
      fail(403, 'FORBIDDEN', ru.onlyOwner);
    }
    const user = await upsertFromTelegram({
      telegramId: BigInt(body.telegramId),
      firstName: body.firstName,
    });
    return { token: signUser(reply, user), user: publicUser(user) };
  });

  app.get('/api/v1/me', async (request) => {
    const user = await requireUser(request);
    const tournament = await currentTournament();
    const entry = tournament
      ? await prisma.entry.findFirst({
          where: {
            tournamentId: tournament.id,
            OR: [{ captainId: user.id }, { partnerId: user.id }],
          },
        })
      : null;
    return { user: publicUser(user), entry, isStaff: user.role === 'ADMIN' || user.role === 'OWNER', sandbox: env.allowDevLogin };
  });

  app.get('/api/v1/tournaments', async (request) => {
    const user = await optionalUser(request);
    const visible = await prisma.tournament.findMany({
      where: { status: { notIn: ['DRAFT', 'CANCELLED'] } },
      orderBy: { createdAt: 'desc' },
    });
    const mineIds = new Set<string>();
    if (user) {
      const entries = await prisma.entry.findMany({
        where: {
          OR: [{ captainId: user.id }, { partnerId: user.id }],
          status: { notIn: ['WITHDRAWN', 'DISQUALIFIED'] },
        },
        select: { tournamentId: true },
      });
      for (const row of entries) mineIds.add(row.tournamentId);
    }
    const mine = await prisma.tournament.findMany({
      where: { id: { in: [...mineIds] } },
      orderBy: { createdAt: 'desc' },
    });
    return {
      available: visible.filter((row) => !mineIds.has(row.id)).map((row) => serializeTournamentCard(row, false)),
      mine: mine.map((row) => serializeTournamentCard(row, true)),
    };
  });

  app.get('/api/v1/tournaments/:id', async (request) => {
    const user = await optionalUser(request);
    const { id } = request.params as { id: string };
    const tournament = await tournamentById(id);
    if (!tournament) fail(404, 'NOT_FOUND', ru.tournamentMissing);
    if ((tournament.status === 'DRAFT' || tournament.status === 'CANCELLED') && user?.role !== 'ADMIN' && user?.role !== 'OWNER') {
      fail(404, 'NOT_FOUND', ru.tournamentMissing);
    }
    return publicTournamentPayload(tournament, user?.id);
  });

  app.post('/api/v1/tournaments/:id/entries', async (request) => {
    const user = await requireUser(request);
    const { id } = request.params as { id: string };
    const body = entryWriteSchema.parse(request.body);
    const tournament = await prisma.tournament.findUnique({ where: { id } });
    if (!tournament) fail(404, 'NOT_FOUND', ru.tournamentMissing);
    const existing = await prisma.entry.findFirst({
      where: { tournamentId: id, OR: [{ captainId: user.id }, { partnerId: user.id }] },
    });
    if (existing) return { entry: existing, already: true };
    const entry = await prisma.entry.create({
      data: {
        tournamentId: id,
        type: body.type,
        captainId: user.id,
        status: env.allowDevLogin ? 'ACTIVE' : 'PENDING_PAYMENT',
        ratingSnapshot: body.rating ?? null,
      },
    });
    return { entry, already: false };
  });

  app.get('/api/v1/tournament', async (request) => {
    const user = await optionalUser(request);
    const tournament = await currentTournament();
    if (!tournament) fail(404, 'NOT_FOUND', ru.tournamentMissing);
    return publicTournamentPayload(tournament, user?.id);
  });

  app.get('/api/v1/clubs', async () =>
    prisma.club.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
  );

  app.get('/api/v1/matches/me', async (request) => {
    const user = await requireUser(request);
    const entries = await prisma.entry.findMany({
      where: { OR: [{ captainId: user.id }, { partnerId: user.id }] },
      select: { id: true },
    });
    const entryIds = entries.map((row) => row.id);
    const matches = await prisma.match.findMany({
      where: {
        round: { status: 'PUBLISHED' },
        ...(entryIds.length
          ? { OR: [{ sideA: { entries: { some: { entryId: { in: entryIds } } } } }, { sideB: { entries: { some: { entryId: { in: entryIds } } } } }] }
          : {}),
      },
      include: matchInclude,
      orderBy: [{ round: { stage: 'asc' } }, { deadlineAt: 'asc' }],
    });
    return { matches: matches.map(serializeMatch), mine: entryIds.length > 0 };
  });

  app.get('/api/v1/matches', async (request) => {
    const q = request.query as { tournamentId?: string };
    const tournament = await tournamentById(q.tournamentId);
    if (!tournament) return { matches: [] };
    const matches = await prisma.match.findMany({
      where: { tournamentId: tournament.id, round: { status: 'PUBLISHED' } },
      include: matchInclude,
      orderBy: [{ round: { stage: 'asc' } }, { round: { number: 'asc' } }, { createdAt: 'asc' }],
    });
    return { matches: matches.map(serializeMatch) };
  });

  app.get('/api/v1/standings', async (request) => {
    const q = request.query as { tournamentId?: string };
    const tournament = await tournamentById(q.tournamentId);
    if (!tournament) return { rows: [] };
    const rows = await prisma.standing.findMany({
      where: { tournamentId: tournament.id },
      include: { entry: { include: { captain: true, partner: true } } },
      orderBy: { rank: 'asc' },
    });
    return {
      rows: rows.map((row) => ({
        rank: row.rank,
        played: row.played,
        wins: row.wins,
        losses: row.losses,
        byes: row.byes,
        setsWon: row.setsWon,
        setsLost: row.setsLost,
        gamesWon: row.gamesWon,
        gamesLost: row.gamesLost,
        label:
          row.entry.type === 'PAIR'
            ? `${row.entry.captain.firstName} / ${row.entry.partner?.firstName ?? '…'}`
            : row.entry.captain.firstName,
        type: row.entry.type,
      })),
    };
  });

  app.get('/api/v1/bracket', async (request) => {
    const q = request.query as { tournamentId?: string };
    const tournament = await tournamentById(q.tournamentId);
    if (!tournament) return { divisions: [] };
    const divisions = await prisma.division.findMany({
      where: { tournamentId: tournament.id, published: true },
      orderBy: { number: 'asc' },
    });
    const payload = [];
    for (const division of divisions) {
      const rounds = await prisma.round.findMany({
        where: { tournamentId: tournament.id, stage: 'PLAYOFF', divisionId: division.id, status: 'PUBLISHED' },
        include: { matches: { include: matchInclude, orderBy: { bracketSlot: 'asc' } } },
        orderBy: { number: 'asc' },
      });
      payload.push({
        id: division.id,
        number: division.number,
        title: division.title,
        rounds: rounds.map((round) => ({
          id: round.id,
          title: round.title,
          matches: round.matches.map(serializeMatch),
        })),
      });
    }
    return { divisions: payload };
  });

  app.get('/api/v1/admin/overview', async (request) => {
    await requireStaff(request);
    const [entries, payments, disputes, pendingRatings, tournaments, matches] = await Promise.all([
      prisma.entry.count(),
      prisma.payment.count({ where: { status: { in: ['PAID', 'MANUAL_PAID'] } } }),
      prisma.match.count({ where: { status: 'DISPUTED' } }),
      prisma.ratingProof.count({ where: { status: 'PENDING' } }),
      prisma.tournament.count(),
      prisma.match.count({ where: { status: { in: ['CONFIRMED', 'BYE'] } } }),
    ]);
    return { entries, payments, disputes, pendingRatings, tournaments, matches, sandbox: env.allowDevLogin };
  });

  app.post('/api/v1/admin/sandbox/fill', async (request) => {
    const actor = await requireStaff(request);
    if (!env.allowDevLogin) fail(403, 'DEV_OFF', ru.devLoginOff);
    const body = (request.body ?? {}) as { tournamentId?: string };
    const tournament = body.tournamentId
      ? await prisma.tournament.findUnique({ where: { id: body.tournamentId } })
      : await currentTournament();
    if (!tournament) fail(404, 'NOT_FOUND', ru.tournamentMissing);
    return fillChampionship(tournament.id, actor, tournament.targetEntries || 30);
  });

  app.post('/api/v1/admin/sandbox/play', async (request) => {
    const actor = await requireStaff(request);
    if (!env.allowDevLogin) fail(403, 'DEV_OFF', ru.devLoginOff);
    const body = (request.body ?? {}) as { tournamentId?: string };
    const tournament = body.tournamentId
      ? await prisma.tournament.findUnique({ where: { id: body.tournamentId } })
      : await currentTournament();
    if (!tournament) fail(404, 'NOT_FOUND', ru.tournamentMissing);
    return playThrough(tournament.id, actor);
  });

  app.get('/api/v1/admin/tournaments', async (request) => {
    await requireStaff(request);
    const rows = await prisma.tournament.findMany({
      orderBy: { createdAt: 'desc' },
      include: { venues: true },
    });
    return rows.map((row) => ({ ...row, clubIds: row.venues.map((venue) => venue.clubId) }));
  });

  app.post('/api/v1/admin/tournaments', async (request) => {
    const actor = await requireStaff(request);
    const body = tournamentWriteSchema.parse(request.body);
    const created = await prisma.tournament.create({
      data: {
        title: body.title,
        status: body.status ?? 'DRAFT',
        feePairKopecks: body.feePairKopecks,
        feeSoloKopecks: body.feeSoloKopecks,
        organizerShareBp: body.organizerShareBp ?? 3000,
        targetEntries: body.targetEntries ?? 30,
        maxEntries: body.maxEntries ?? null,
        registrationOpensAt: body.registrationOpensAt ? new Date(body.registrationOpensAt) : null,
        registrationClosesAt: body.registrationClosesAt ? new Date(body.registrationClosesAt) : null,
        startsAt: body.startsAt ? new Date(body.startsAt) : null,
        endsAt: body.endsAt ? new Date(body.endsAt) : null,
        finalsAt: body.finalsAt ? new Date(body.finalsAt) : null,
        finalsNote: body.finalsNote ?? null,
        conditions: body.conditions ?? null,
        prizeEnabled: body.prizeEnabled ?? false,
        divisionSharesBp: [6000, 3000, 1000],
        placeSharesBp: [7000, 3000],
        config: { ...DEFAULT_TOURNAMENT_CONFIG, ...body.config },
      },
    });
    if (body.clubIds?.length) {
      await prisma.tournamentClub.createMany({
        data: body.clubIds.map((clubId) => ({ tournamentId: created.id, clubId })),
      });
    }
    await audit(actor.id, 'TOURNAMENT_CREATE', 'Tournament', created.id, null, created);
    return { tournament: created, message: ru.championshipCreated };
  });

  app.put('/api/v1/admin/tournament/:id', async (request) => {
    const actor = await requireStaff(request);
    const { id } = request.params as { id: string };
    const body = tournamentWriteSchema.parse(request.body);
    const before = await prisma.tournament.findUnique({ where: { id } });
    if (!before) fail(404, 'NOT_FOUND', ru.tournamentMissing);
    const config = { ...parseTournamentConfig(before.config), ...body.config };
    const updated = await prisma.tournament.update({
      where: { id },
      data: {
        title: body.title,
        status: body.status ?? before.status,
        feePairKopecks: body.feePairKopecks,
        feeSoloKopecks: body.feeSoloKopecks,
        organizerShareBp: body.organizerShareBp ?? before.organizerShareBp,
        targetEntries: body.targetEntries ?? before.targetEntries,
        maxEntries: body.maxEntries === undefined ? before.maxEntries : body.maxEntries,
        registrationOpensAt: body.registrationOpensAt === undefined ? before.registrationOpensAt : body.registrationOpensAt ? new Date(body.registrationOpensAt) : null,
        registrationClosesAt: body.registrationClosesAt === undefined ? before.registrationClosesAt : body.registrationClosesAt ? new Date(body.registrationClosesAt) : null,
        startsAt: body.startsAt === undefined ? before.startsAt : body.startsAt ? new Date(body.startsAt) : null,
        endsAt: body.endsAt === undefined ? before.endsAt : body.endsAt ? new Date(body.endsAt) : null,
        finalsAt: body.finalsAt === undefined ? before.finalsAt : body.finalsAt ? new Date(body.finalsAt) : null,
        finalsNote: body.finalsNote === undefined ? before.finalsNote : body.finalsNote,
        conditions: body.conditions === undefined ? before.conditions : body.conditions,
        prizeEnabled: body.prizeEnabled === undefined ? before.prizeEnabled : body.prizeEnabled,
        config,
      },
    });
    if (body.clubIds) {
      await prisma.tournamentClub.deleteMany({ where: { tournamentId: id } });
      if (body.clubIds.length) {
        await prisma.tournamentClub.createMany({
          data: body.clubIds.map((clubId) => ({ tournamentId: id, clubId })),
        });
      }
    }
    await audit(actor.id, 'TOURNAMENT_UPDATE', 'Tournament', id, before, updated);
    return { tournament: updated, message: ru.championshipSaved };
  });

  app.get('/api/v1/admin/clubs', async (request) => {
    await requireStaff(request);
    return prisma.club.findMany({ orderBy: { sortOrder: 'asc' } });
  });

  app.post('/api/v1/admin/clubs', async (request) => {
    const actor = await requireStaff(request);
    const body = clubWriteSchema.parse(request.body);
    const club = await prisma.club.create({ data: body });
    await audit(actor.id, 'CLUB_CREATE', 'Club', club.id, null, club);
    return { club, message: ru.clubSaved };
  });

  app.put('/api/v1/admin/clubs/:id', async (request) => {
    const actor = await requireStaff(request);
    const { id } = request.params as { id: string };
    const body = clubWriteSchema.parse(request.body);
    const club = await prisma.club.update({ where: { id }, data: body });
    await audit(actor.id, 'CLUB_UPDATE', 'Club', id, null, club);
    return { club, message: ru.clubSaved };
  });

  app.get('/api/v1/admin/sponsors', async (request) => {
    await requireStaff(request);
    const q = request.query as { tournamentId?: string };
    const tournament = q.tournamentId
      ? await prisma.tournament.findUnique({ where: { id: q.tournamentId } })
      : await currentTournament();
    if (!tournament) return [];
    return prisma.sponsor.findMany({ where: { tournamentId: tournament.id }, orderBy: { sortOrder: 'asc' } });
  });

  app.post('/api/v1/admin/sponsors', async (request) => {
    const actor = await requireStaff(request);
    const body = sponsorWriteSchema.parse(request.body);
    const extra = request.body as { tournamentId?: string };
    const tournament = extra.tournamentId
      ? await prisma.tournament.findUnique({ where: { id: extra.tournamentId } })
      : await currentTournament();
    if (!tournament) fail(404, 'NOT_FOUND', ru.tournamentMissing);
    const sponsor = await prisma.sponsor.create({ data: { ...body, tournamentId: tournament.id } });
    await audit(actor.id, 'SPONSOR_CREATE', 'Sponsor', sponsor.id, null, sponsor);
    return { sponsor, message: ru.sponsorSaved };
  });

  app.put('/api/v1/admin/sponsors/:id', async (request) => {
    const actor = await requireStaff(request);
    const { id } = request.params as { id: string };
    const body = sponsorWriteSchema.parse(request.body);
    const sponsor = await prisma.sponsor.update({ where: { id }, data: body });
    await audit(actor.id, 'SPONSOR_UPDATE', 'Sponsor', id, null, sponsor);
    return { sponsor, message: ru.sponsorSaved };
  });

  app.get('/api/v1/admin/staff', async (request) => {
    await requireOwner(request);
    const [users, grants] = await Promise.all([
      prisma.user.findMany({ where: { role: { in: ['ADMIN', 'OWNER'] } }, orderBy: { createdAt: 'asc' } }),
      prisma.staffGrant.findMany({ orderBy: { createdAt: 'desc' } }),
    ]);
    return { users: users.map(publicUser), grants: grants.map((g) => ({ ...g, telegramId: g.telegramId.toString() })) };
  });

  app.post('/api/v1/admin/staff', async (request) => {
    const actor = await requireOwner(request);
    const body = staffGrantBodySchema.parse(request.body);
    const telegramId = BigInt(body.telegramId);
    const grant = await prisma.staffGrant.upsert({
      where: { telegramId },
      create: { telegramId, role: body.role, grantedById: actor.id },
      update: { role: body.role, grantedById: actor.id },
    });
    const existing = await prisma.user.findUnique({ where: { telegramId } });
    if (existing) {
      await prisma.user.update({ where: { id: existing.id }, data: { role: body.role } });
    }
    await audit(actor.id, 'STAFF_GRANT', 'StaffGrant', grant.id, null, { telegramId: body.telegramId, role: body.role });
    return { grant: { ...grant, telegramId: grant.telegramId.toString() }, message: ru.staffSaved };
  });

  app.post('/api/v1/admin/rounds/preview', async (request) => {
    await requireStaff(request);
    const body = drawGenerateSchema.parse(request.body);
    const preview = await buildDrawPreview(body.tournamentId, body.seed);
    return preview;
  });

  app.post('/api/v1/admin/rounds', async (request) => {
    const actor = await requireStaff(request);
    const body = drawGenerateSchema.parse(request.body);
    const preview = await buildDrawPreview(body.tournamentId, body.seed);
    if (preview.entries === 0) fail(409, 'EMPTY', ru.drawEmpty);
    const number = (await prisma.round.count({ where: { tournamentId: body.tournamentId, stage: 'QUALIFICATION' } })) + 1;
    const { round } = await materializeQualRound(body.tournamentId, number, preview.seed, null);
    await prisma.round.update({ where: { id: round.id }, data: { status: 'DRAFT', title: `Квалификация, черновик ${number}` } });
    await audit(actor.id, 'ROUND_DRAFT', 'Round', round.id, null, preview);
    return { round: { ...round, status: 'DRAFT' }, preview, message: ru.drawSaved };
  });

  app.post('/api/v1/admin/rounds/:id/publish', async (request) => {
    const actor = await requireStaff(request);
    const { id } = request.params as { id: string };
    const round = await prisma.round.update({ where: { id }, data: { status: 'PUBLISHED' } });
    await audit(actor.id, 'ROUND_PUBLISH', 'Round', id, { status: 'DRAFT' }, { status: 'PUBLISHED' });
    return { round, message: ru.drawPublished };
  });
}

async function buildDrawPreview(tournamentId: string, seed?: string) {
  const entries = await prisma.entry.findMany({
    where: { tournamentId, status: 'ACTIVE' },
  });
  const preview = generateQualDraw(
    entries.map((entry) => ({ id: entry.id, type: entry.type, byeCount: 0 })),
    { partnered: [], opposed: [] },
    seed ?? `draw-${Date.now()}`,
  );
  return { ...preview, entries: entries.length };
}

async function audit(actorId: string, action: string, entityType: string, entityId: string, before: unknown, after: unknown) {
  await prisma.auditLog.create({
    data: {
      actorId,
      action,
      entityType,
      entityId,
      before: before === null ? undefined : (before as object),
      after: after as object,
    },
  });
}

function publicUser(user: { id: string; telegramId: bigint; firstName: string; lastName: string | null; username: string | null; photoUrl: string | null; role: string; lundaRating: unknown; lundaStatus: string; internalRating: number }) {
  return {
    id: user.id,
    telegramId: user.telegramId.toString(),
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
    photoUrl: user.photoUrl,
    role: user.role,
    lundaRating: user.lundaRating,
    lundaStatus: user.lundaStatus,
    internalRating: user.internalRating,
  };
}
