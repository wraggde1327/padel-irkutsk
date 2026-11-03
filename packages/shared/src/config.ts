import { z } from 'zod';

/** §8.0 + ответы заказчика 3 ноября 2026: гибкий состав, независимые взносы, жеребьёвка. */
export const tournamentConfigSchema = z.object({
  qualRounds: z.number().int().min(1).max(6),
  qualRoundDays: z.number().int().min(1).max(21),
  playoffRoundDays: z.object({
    playIn: z.number().int().min(1),
    quarter: z.number().int().min(1),
    semi: z.number().int().min(1),
  }),
  divisionSizes: z.array(z.union([z.number().int().positive(), z.literal('rest')])),
  divisionsCount: z.number().int().min(1).max(8),
  matchFormat: z.object({
    setsToWin: z.literal(2),
    thirdSet: z.enum(['full', 'superTiebreak']),
  }),
  byeCountsAsWin: z.boolean(),
  confirmTimeoutHours: z.number().int().min(1),
  resultGraceHours: z.number().int().min(0),
  inviteExpiresHours: z.number().int().min(1),
  soloPlayoffMode: z.literal('fixedPairsByRating'),
  commissionPayer: z.enum(['organizer', 'payer']),
  reminders: z.array(z.number().int().positive()),
  initialRating: z.object({
    base: z.number().int(),
    perLundaPoint: z.number(),
    lundaAnchor: z.number(),
  }),
  rating: z.object({ k: z.number() }),
  fillFromPlaces: z.array(z.number().int().min(1)),
  drawModes: z.array(z.enum(['auto', 'manual'])),
});

export type TournamentConfig = z.infer<typeof tournamentConfigSchema>;

export const DEFAULT_TOURNAMENT_CONFIG: TournamentConfig = {
  qualRounds: 2,
  qualRoundDays: 7,
  playoffRoundDays: { playIn: 4, quarter: 5, semi: 5 },
  divisionSizes: [10, 10, 'rest'],
  divisionsCount: 3,
  matchFormat: { setsToWin: 2, thirdSet: 'full' },
  byeCountsAsWin: true,
  confirmTimeoutHours: 48,
  resultGraceHours: 12,
  inviteExpiresHours: 72,
  soloPlayoffMode: 'fixedPairsByRating',
  commissionPayer: 'organizer',
  reminders: [72, 24, 3],
  initialRating: { base: 1000, perLundaPoint: 100, lundaAnchor: 3 },
  rating: { k: 32 },
  fillFromPlaces: [3, 4],
  drawModes: ['auto', 'manual'],
};

export function parseTournamentConfig(raw: unknown): TournamentConfig {
  const parsed = tournamentConfigSchema.safeParse(raw);
  if (!parsed.success) {
    return DEFAULT_TOURNAMENT_CONFIG;
  }
  return parsed.data;
}
