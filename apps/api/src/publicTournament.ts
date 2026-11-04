import { parseTournamentConfig, prizeFundFromPaid } from '@padel/shared';
import type { Club, Sponsor, Tournament } from '@prisma/client';

export type TournamentCard = {
  id: string;
  title: string;
  status: string;
  startsAt: Date | null;
  feePairKopecks: number;
  joined: boolean;
};

export function serializeTournamentCard(tournament: Tournament, joined: boolean): TournamentCard {
  return {
    id: tournament.id,
    title: tournament.title,
    status: tournament.status,
    startsAt: tournament.startsAt,
    feePairKopecks: tournament.feePairKopecks,
    joined,
  };
}

export function serializeTournament(
  tournament: Tournament & { finalsClub?: Club | null },
  extras: { clubs: Club[]; sponsors: Sponsor[]; paidKopecks: number[]; joined?: boolean },
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
    conditions: tournament.conditions,
    prizeEnabled: tournament.prizeEnabled,
    config,
    prize: tournament.prizeEnabled ? fund : null,
    clubs: extras.clubs,
    sponsors: extras.sponsors,
    joined: extras.joined ?? false,
  };
}
