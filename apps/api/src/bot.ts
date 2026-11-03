import { Bot } from 'grammy';
import { env } from './env';
import { ru } from './i18n/ru';

export function createBot(): Bot | null {
  if (!env.botToken || env.botToken.startsWith('000000')) {
    return null;
  }
  const bot = new Bot(env.botToken);
  bot.command('start', async (ctx) => {
    const url = `https://t.me/${env.botUsername}/${env.miniAppShortName}`;
    await ctx.reply(ru.startHello, {
      reply_markup: {
        inline_keyboard: [[{ text: ru.openTournament, web_app: { url } }]],
      },
    });
  });
  return bot;
}

export function telegramWebhookPath(): string {
  return `/webhooks/telegram/${env.telegramWebhookSecret}`;
}

export function attachBot(app: import('fastify').FastifyInstance, bot: Bot): void {
  app.post(telegramWebhookPath(), async (request, reply) => {
    const header = request.headers['x-telegram-bot-api-secret-token'];
    if (header !== env.telegramWebhookSecret) {
      reply.code(401).send({ error: { code: 'FORBIDDEN', message: ru.forbidden } });
      return;
    }
    await bot.handleUpdate(request.body as Parameters<Bot['handleUpdate']>[0]);
    reply.code(200).send({ ok: true });
  });
}
