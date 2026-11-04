import { z } from 'zod';
import { tournamentConfigSchema } from './config';

export const errorBodySchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

export const authTelegramBodySchema = z.object({
  initData: z.string().min(1),
});

export const authDevBodySchema = z.object({
  telegramId: z.string().regex(/^\d+$/),
  firstName: z.string().min(1).max(64),
  role: z.enum(['PLAYER', 'ADMIN', 'OWNER']).optional(),
});

export const lundaRatingBodySchema = z.object({
  rating: z.number().min(1).max(7).multipleOf(0.1),
});

export const staffGrantBodySchema = z.object({
  telegramId: z.string().regex(/^\d+$/),
  role: z.enum(['ADMIN', 'PLAYER']),
});

export const tournamentWriteSchema = z.object({
  title: z.string().min(2).max(120),
  status: z
    .enum([
      'DRAFT',
      'REGISTRATION',
      'QUALIFICATION',
      'DIVISIONS_READY',
      'PLAYOFF',
      'FINALS',
      'DONE',
      'CANCELLED',
    ])
    .optional(),
  feePairKopecks: z.number().int().min(0),
  feeSoloKopecks: z.number().int().min(0),
  organizerShareBp: z.number().int().min(0).max(10000).optional(),
  targetEntries: z.number().int().min(2).optional(),
  maxEntries: z.number().int().min(2).nullable().optional(),
  registrationOpensAt: z.string().datetime().nullable().optional(),
  registrationClosesAt: z.string().datetime().nullable().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  finalsAt: z.string().datetime().nullable().optional(),
  finalsNote: z.string().max(500).nullable().optional(),
  conditions: z.string().max(4000).nullable().optional(),
  prizeEnabled: z.boolean().optional(),
  clubIds: z.array(z.string()).optional(),
  config: tournamentConfigSchema.partial().optional(),
});

export const entryWriteSchema = z.object({
  type: z.enum(['PAIR', 'SOLO']),
  rating: z.number().min(1).max(7).optional(),
});

export const clubWriteSchema = z.object({
  name: z.string().min(1).max(80),
  address: z.string().max(200).nullable().optional(),
  mapUrl: z.string().url().nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  logoUrl: z.string().url().nullable().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export const sponsorWriteSchema = z.object({
  kind: z.enum(['CLUB_DISCOUNT', 'LOGO']),
  name: z.string().min(1).max(80),
  clubId: z.string().nullable().optional(),
  logoUrl: z.string().url().nullable().optional(),
  linkUrl: z.string().url().nullable().optional(),
  description: z.string().max(400).nullable().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export const drawGenerateSchema = z.object({
  tournamentId: z.string(),
  seed: z.string().min(1).optional(),
  mode: z.enum(['auto', 'manual']).optional(),
});

export type TournamentWrite = z.infer<typeof tournamentWriteSchema>;
