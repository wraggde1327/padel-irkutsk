import '../src/loadEnv';
import { PrismaClient } from '@prisma/client';
import { DEFAULT_TOURNAMENT_CONFIG } from '@padel/shared';

const prisma = new PrismaClient();

async function main() {
  await Promise.all(
    [
      { name: 'Клуб 1', address: 'Адрес уточнит администратор', sortOrder: 1 },
      { name: 'Клуб 2', address: 'Адрес уточнит администратор', sortOrder: 2 },
      { name: 'Клуб 3', address: 'Адрес уточнит администратор', sortOrder: 3 },
    ].map((club) =>
      prisma.club.upsert({
        where: { id: `seed-club-${club.sortOrder}` },
        update: club,
        create: { id: `seed-club-${club.sortOrder}`, ...club },
      }),
    ),
  );

  const existing = await prisma.tournament.findFirst();
  if (!existing) {
    await prisma.tournament.create({
      data: {
        title: 'Падел-турнир, Иркутск',
        status: 'REGISTRATION',
        feePairKopecks: 400000,
        feeSoloKopecks: 200000,
        organizerShareBp: 3000,
        divisionSharesBp: [6000, 3000, 1000],
        placeSharesBp: [7000, 3000],
        prizeEnabled: false,
        timezone: 'Asia/Irkutsk',
        config: DEFAULT_TOURNAMENT_CONFIG,
      },
    });
  }
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
