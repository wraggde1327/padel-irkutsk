import './loadEnv';
import { buildApp } from './app';
import { env } from './env';
import { prisma } from './prisma';

const app = await buildApp();
await app.listen({ port: env.port, host: '0.0.0.0' });
app.log.info(`API http://127.0.0.1:${env.port}`);

const shutdown = async () => {
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
