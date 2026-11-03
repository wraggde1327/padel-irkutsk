import { parseTournamentConfig, prizeFundFromPaid } from '@padel/shared';
import type { Club, Sponsor, Tournament } from '@prisma/client';

export function serializeTournament(
  tournament: Tournament & { finalsClub?: Club | null; clubs?: Club[]; sponsors?: Sponsor[] },
  extras: { clubs: Club[]; sponsors: Sponsor[]; paidKopecks: number[] },
) {
  const config = parseTournamentConfig(tournament.config);
  const fund = prizeFundFromPaid(extras.paidKopecks, tournament.organizerShareBp, tournament.divisionSharesBp);
  return {
    id: tournament.id,
    title: tournament.title,
    status: tournament.status,
    timezone: tournament.timezone,
    feePairKopecks: tournament.feePairKopecks,
    feeSoloKopecks: tournament.feeSoloKopecks,
    organizerShareBp: tournament.organizerShareBp,
    divisionSharesBp: tournament.divisionSharesBp,
    placeSharesBp: tournament.placeSharesBp,
    targetEntries: tournament.targetEntries,
    maxEntries: tournament.maxEntries,
    registrationOpensAt: tournament.registrationOpensAt,
    registrationClosesAt: tournament.registrationClosesAt,
    startsAt: tournament.startsAt,
    endsAt: tournament.endsAt,
    finalsAt: tournament.finalsAt,
    finalsNote: tournament.finalsNote,
    config,
    prize: fund,
    clubs: extras.clubs,
    sponsors: extras.sponsors,
  };
}
