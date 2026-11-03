import { describe, expect, it } from 'vitest';
import { buildInitData, verifyInitData } from './telegram';

const TOKEN = '123456:TEST_BOT_TOKEN';
const user = { id: 1001, first_name: 'Иван', username: 'ivan' };

describe('verifyInitData §9.1', () => {
  it('accepts a valid signature', () => {
    const now = 1_700_000_000;
    const initData = buildInitData(user, TOKEN, now);
    const result = verifyInitData(initData, TOKEN, now, 3600);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.user.id).toBe(1001);
  });

  it('rejects a forged hash', () => {
    const now = 1_700_000_000;
    const initData = buildInitData(user, TOKEN, now).replace(/hash=[0-9a-f]+/, 'hash=deadbeef');
    const result = verifyInitData(initData, TOKEN, now, 3600);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INVALID_SIGNATURE');
  });

  it('rejects expired auth_date', () => {
    const now = 1_700_000_000;
    const initData = buildInitData(user, TOKEN, now - 7200);
    const result = verifyInitData(initData, TOKEN, now, 3600);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('EXPIRED');
  });
});
