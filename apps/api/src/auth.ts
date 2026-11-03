import type { FastifyReply, FastifyRequest } from 'fastify';
import { verifyInitData } from '@padel/shared/telegram';
import type { Role, User } from '@prisma/client';
import { env } from './env';
import { fail } from './errors';
import { ru } from './i18n/ru';
import { prisma } from './prisma';

export type JwtUser = {
  sub: string;
  telegramId: string;
  role: Role;
};

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtUser;
    user: JwtUser;
  }
}

export async function resolveRole(telegramId: bigint): Promise<Role> {
  if (env.ownerTelegramId && String(telegramId) === env.ownerTelegramId) return 'OWNER';
  const grant = await prisma.staffGrant.findUnique({ where: { telegramId } });
  if (grant) return grant.role;
  if (env.adminTelegramIds.includes(String(telegramId))) return 'ADMIN';
  return 'PLAYER';
}

export async function upsertFromTelegram(input: {
  telegramId: bigint;
  firstName: string;
  lastName?: string;
  username?: string;
  photoUrl?: string;
  languageCode?: string;
  canMessage?: boolean;
}): Promise<User> {
  const role = await resolveRole(input.telegramId);
  return prisma.user.upsert({
    where: { telegramId: input.telegramId },
    create: {
      telegramId: input.telegramId,
      firstName: input.firstName,
      lastName: input.lastName,
      username: input.username,
      photoUrl: input.photoUrl,
      languageCode: input.languageCode,
      canMessage: input.canMessage ?? false,
      role,
    },
    update: {
      firstName: input.firstName,
      lastName: input.lastName,
      username: input.username,
      photoUrl: input.photoUrl,
      languageCode: input.languageCode,
      role,
    },
  });
}

export function verifyTelegramInitData(initData: string, nowSec = Math.floor(Date.now() / 1000)) {
  const result = verifyInitData(initData, env.botToken, nowSec, env.initDataMaxAgeSec);
  if (!result.ok) {
    if (result.error.code === 'EXPIRED') fail(401, 'EXPIRED', ru.expired);
    if (result.error.code === 'INVALID_SIGNATURE') fail(401, 'INVALID_SIGNATURE', ru.badSignature);
    fail(401, 'MALFORMED', ru.malformed);
  }
  return result.value;
}

export async function requireUser(request: FastifyRequest): Promise<User> {
  try {
    await request.jwtVerify();
  } catch {
    fail(401, 'UNAUTHORIZED', ru.unauthorized);
  }
  const user = await prisma.user.findUnique({ where: { id: request.user.sub } });
  if (!user) fail(401, 'UNAUTHORIZED', ru.unauthorized);
  return user;
}

export async function requireStaff(request: FastifyRequest): Promise<User> {
  const user = await requireUser(request);
  if (user.role !== 'ADMIN' && user.role !== 'OWNER') fail(403, 'FORBIDDEN', ru.forbidden);
  return user;
}

export async function requireOwner(request: FastifyRequest): Promise<User> {
  const user = await requireUser(request);
  if (user.role !== 'OWNER') fail(403, 'FORBIDDEN', ru.onlyOwner);
  return user;
}

export function signUser(reply: FastifyReply, user: User): string {
  return reply.server.jwt.sign(
    { sub: user.id, telegramId: user.telegramId.toString(), role: user.role },
    { expiresIn: '24h' },
  );
}
