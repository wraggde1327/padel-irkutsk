import { createHash, randomInt } from 'node:crypto';
import type { User } from '@prisma/client';
import { resolveRole } from './auth';
import { env } from './env';
import { fail } from './errors';
import { prisma } from './prisma';

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export function normalizeTarget(channel: 'TELEGRAM' | 'PHONE' | 'EMAIL', raw: string): string {
  const value = raw.trim();
  if (channel === 'EMAIL') {
    const email = value.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'VALIDATION', 'Укажите корректный email');
    return email;
  }
  if (channel === 'PHONE') {
    const only = value.replace(/\D/g, '');
    let digits = only;
    if (digits.length === 11 && digits.startsWith('8')) digits = `7${digits.slice(1)}`;
    if (digits.length === 10) digits = `7${digits}`;
    if (digits.length < 10 || digits.length > 15) fail(400, 'VALIDATION', 'Укажите телефон с кодом страны');
    return `+${digits}`;
  }
  // TELEGRAM: numeric id or @username
  if (/^\d+$/.test(value)) return value;
  const username = value.replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9_]{5,32}$/.test(username)) fail(400, 'VALIDATION', 'Укажите @username или Telegram ID');
  return username;
}

function hashCode(target: string, code: string): string {
  return createHash('sha256').update(`${target}:${code}:${env.jwtSecret}`).digest('hex');
}

function makeCode(): string {
  return String(randomInt(100000, 999999));
}

export async function issueAuthCode(channel: 'TELEGRAM' | 'PHONE' | 'EMAIL', rawTarget: string) {
  const target = normalizeTarget(channel, rawTarget);
  const code = makeCode();
  const codeHash = hashCode(target, code);
  await prisma.authCode.updateMany({
    where: { channel, target, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  await prisma.authCode.create({
    data: {
      channel,
      target,
      codeHash,
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    },
  });
  const delivered = await deliverCode(channel, target, code);
  return {
    ok: true as const,
    channel,
    target,
    expiresInSec: Math.floor(CODE_TTL_MS / 1000),
    delivery: delivered,
    // В тесте/без провайдеров код отдаём в ответе, чтобы можно было проверить вход
    debugCode: env.allowDevLogin || delivered === 'mock' ? code : undefined,
  };
}

async function deliverCode(channel: 'TELEGRAM' | 'PHONE' | 'EMAIL', target: string, code: string): Promise<'telegram' | 'sms' | 'email' | 'mock'> {
  if (channel === 'TELEGRAM') {
    // Реальная отправка — через бота, когда BOT_TOKEN боевой. Пока mock.
    if (!env.botToken.includes('dev-placeholder')) {
      // hook for grammY sendMessage later
      console.info(`[auth] telegram code for ${target}: ${code}`);
      return 'telegram';
    }
  }
  if (channel === 'PHONE') {
    console.info(`[auth] SMS code for ${target}: ${code}`);
    return 'mock';
  }
  if (channel === 'EMAIL') {
    console.info(`[auth] email code for ${target}: ${code}`);
    return 'mock';
  }
  return 'mock';
}

export async function verifyAuthCode(channel: 'TELEGRAM' | 'PHONE' | 'EMAIL', rawTarget: string, code: string): Promise<User> {
  const target = normalizeTarget(channel, rawTarget);
  const row = await prisma.authCode.findFirst({
    where: { channel, target, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!row) fail(400, 'CODE_MISSING', 'Сначала запросите код');
  if (row.expiresAt.getTime() < Date.now()) fail(400, 'CODE_EXPIRED', 'Код устарел — запросите новый');
  if (row.attempts >= MAX_ATTEMPTS) fail(429, 'CODE_LOCKED', 'Слишком много попыток');
  const ok = row.codeHash === hashCode(target, code.trim());
  if (!ok) {
    await prisma.authCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
    fail(400, 'CODE_INVALID', 'Неверный код');
  }
  await prisma.authCode.update({ where: { id: row.id }, data: { consumedAt: new Date() } });
  return findOrCreateByChannel(channel, target);
}

async function findOrCreateByChannel(channel: 'TELEGRAM' | 'PHONE' | 'EMAIL', target: string): Promise<User> {
  if (channel === 'PHONE') {
    const existing = await prisma.user.findUnique({ where: { phone: target } });
    if (existing) return existing;
    return prisma.user.create({
      data: {
        firstName: 'Игрок',
        phone: target,
        authChannel: 'PHONE',
        profileComplete: false,
        telegramId: null,
      },
    });
  }
  if (channel === 'EMAIL') {
    const existing = await prisma.user.findUnique({ where: { email: target } });
    if (existing) return existing;
    return prisma.user.create({
      data: {
        firstName: 'Игрок',
        email: target,
        authChannel: 'EMAIL',
        profileComplete: false,
        telegramId: null,
      },
    });
  }
  // TELEGRAM by numeric id or username
  if (/^\d+$/.test(target)) {
    const telegramId = BigInt(target);
    const role = await resolveRole(telegramId);
    return prisma.user.upsert({
      where: { telegramId },
      create: {
        telegramId,
        firstName: 'Игрок',
        authChannel: 'TELEGRAM',
        profileComplete: false,
        role,
      },
      update: { role, authChannel: 'TELEGRAM' },
    });
  }
  const existing = await prisma.user.findFirst({ where: { username: target } });
  if (existing) return existing;
  return prisma.user.create({
    data: {
      firstName: 'Игрок',
      username: target,
      authChannel: 'TELEGRAM',
      profileComplete: false,
      telegramId: null,
    },
  });
}

export async function createGuestUser(firstName = 'Гость'): Promise<User> {
  return prisma.user.create({
    data: {
      firstName,
      lastName: 'Тест',
      authChannel: 'GUEST',
      profileComplete: true,
      telegramId: null,
      role: 'PLAYER',
    },
  });
}

export function needsProfile(user: User): boolean {
  if (user.authChannel === 'GUEST') return false;
  return !user.profileComplete;
}
