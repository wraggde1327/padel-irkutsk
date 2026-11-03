function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing env ${name}`);
  }
  return value;
}

function list(name: string): string[] {
  return (process.env[name] ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.API_PORT ?? 4822),
  databaseUrl: required('DATABASE_URL', 'postgresql://padel:padel@127.0.0.1:5432/padel'),
  botToken: process.env.BOT_TOKEN || '000000:dev-placeholder-token',
  botUsername: process.env.BOT_USERNAME || 'padel_dev_bot',
  miniAppShortName: process.env.MINIAPP_SHORT_NAME || 'app',
  telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || 'dev-webhook-secret',
  jwtSecret: process.env.JWT_SECRET || 'dev-jwt-secret-change-me',
  publicBaseUrl: process.env.PUBLIC_BASE_URL || 'http://127.0.0.1:4174',
  adminTelegramIds: list('ADMIN_TELEGRAM_IDS'),
  ownerTelegramId: process.env.OWNER_TELEGRAM_ID || '',
  initDataMaxAgeSec: Number(process.env.INITDATA_MAX_AGE_SEC ?? 3600),
  allowDevLogin: (process.env.ALLOW_DEV_LOGIN ?? 'true') === 'true',
};

export function isProd(): boolean {
  return env.nodeEnv === 'production';
}
