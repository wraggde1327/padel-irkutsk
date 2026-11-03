import { createHmac, timingSafeEqual } from 'node:crypto';

export const INITDATA_MAX_AGE_SEC_DEFAULT = 3600;

export type TelegramWebUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
  allows_write_to_pm?: boolean;
};

export type InitDataOk = {
  user: TelegramWebUser;
  authDate: number;
};

export type InitDataError = {
  code: 'INVALID_SIGNATURE' | 'EXPIRED' | 'MISSING_USER' | 'MALFORMED';
};

function dataCheckString(params: URLSearchParams): string {
  const pairs: string[] = [];
  const keys = [...params.keys()].filter((key) => key !== 'hash').sort();
  for (const key of keys) {
    pairs.push(`${key}=${params.get(key) ?? ''}`);
  }
  return pairs.join('\n');
}

export function signInitData(params: URLSearchParams, botToken: string): string {
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  return createHmac('sha256', secret).update(dataCheckString(params)).digest('hex');
}

export function verifyInitData(
  initData: string,
  botToken: string,
  nowSec: number,
  maxAgeSec = INITDATA_MAX_AGE_SEC_DEFAULT,
): { ok: true; value: InitDataOk } | { ok: false; error: InitDataError } {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return { ok: false, error: { code: 'MALFORMED' } };
  }

  const hash = params.get('hash');
  const authDateRaw = params.get('auth_date');
  const userRaw = params.get('user');
  if (!hash || !authDateRaw || !userRaw) {
    return { ok: false, error: { code: 'MALFORMED' } };
  }

  const expected = signInitData(params, botToken);
  const got = Buffer.from(hash, 'utf8');
  const want = Buffer.from(expected, 'utf8');
  if (got.length !== want.length || !timingSafeEqual(got, want)) {
    return { ok: false, error: { code: 'INVALID_SIGNATURE' } };
  }

  const authDate = Number(authDateRaw);
  if (!Number.isFinite(authDate) || nowSec - authDate > maxAgeSec) {
    return { ok: false, error: { code: 'EXPIRED' } };
  }

  let user: TelegramWebUser;
  try {
    user = JSON.parse(userRaw) as TelegramWebUser;
  } catch {
    return { ok: false, error: { code: 'MALFORMED' } };
  }
  if (!user.id || !user.first_name) {
    return { ok: false, error: { code: 'MISSING_USER' } };
  }

  return { ok: true, value: { user, authDate } };
}

export function buildInitData(user: TelegramWebUser, botToken: string, authDate: number): string {
  const params = new URLSearchParams();
  params.set('auth_date', String(authDate));
  params.set('query_id', 'dev');
  params.set('user', JSON.stringify(user));
  params.set('hash', signInitData(params, botToken));
  return params.toString();
}
