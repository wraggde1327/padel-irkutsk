-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN "conditions" TEXT;
ALTER TABLE "Tournament" ADD COLUMN "prizeEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "TournamentClub" (
    "tournamentId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,

    CONSTRAINT "TournamentClub_pkey" PRIMARY KEY ("tournamentId","clubId")
);

-- AddForeignKey
ALTER TABLE "TournamentClub" ADD CONSTRAINT "TournamentClub_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TournamentClub" ADD CONSTRAINT "TournamentClub_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
