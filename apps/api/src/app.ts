import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import staticFiles from '@fastify/static';
import Fastify from 'fastify';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZodError } from 'zod';
import { attachBot, createBot } from './bot';
import { env } from './env';
import { ApiError } from './errors';
import { registerRoutes } from './routes';

const webDist = path.resolve(fileURLToPath(new URL('../../web/dist', import.meta.url)));

export async function buildApp() {
  const app = Fastify({ logger: { level: 'info' } });
  await app.register(cors, { origin: true });
  await app.register(jwt, { secret: env.jwtSecret });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ApiError) {
      reply.code(error.statusCode).send({ error: { code: error.code, message: error.message } });
      return;
    }
    if (error instanceof ZodError) {
      reply.code(400).send({ error: { code: 'VALIDATION', message: error.issues[0]?.message ?? 'Некорректные данные' } });
      return;
    }
    app.log.error(error);
    reply.code(500).send({ error: { code: 'INTERNAL', message: 'Внутренняя ошибка' } });
  });
  await registerRoutes(app);
  if (existsSync(webDist)) {
    await app.register(staticFiles, { root: webDist, wildcard: false });
    app.setNotFoundHandler((request, reply) => {
      if (request.method === 'GET' && !request.url.startsWith('/api') && !request.url.startsWith('/health') && !request.url.startsWith('/webhooks')) {
        return reply.sendFile('index.html');
      }
      reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Не найдено' } });
    });
  }
  const bot = createBot();
  if (bot) attachBot(app, bot);
  return app;
}
