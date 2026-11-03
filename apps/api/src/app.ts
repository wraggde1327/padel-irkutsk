import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import Fastify from 'fastify';
import { ZodError } from 'zod';
import { attachBot, createBot } from './bot';
import { env } from './env';
import { ApiError } from './errors';
import { registerRoutes } from './routes';

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
  const bot = createBot();
  if (bot) attachBot(app, bot);
  return app;
}
