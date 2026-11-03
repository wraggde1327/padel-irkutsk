import { describe, expect, it } from 'vitest';
import { buildInitData, verifyInitData } from '@padel/shared/telegram';

const TOKEN = 'bot-token';

describe('api auth uses shared initData', () => {
  it('valid, forged and expired', () => {
    const now = 1_800_000_000;
    const user = { id: 7, first_name: 'Анна' };
    const valid = buildInitData(user, TOKEN, now);
    expect(verifyInitData(valid, TOKEN, now).ok).toBe(true);
    expect(verifyInitData(valid.replace(/hash=[0-9a-f]+/, 'hash=00'), TOKEN, now).ok).toBe(false);
    expect(verifyInitData(buildInitData(user, TOKEN, now - 10_000), TOKEN, now, 60).ok).toBe(false);
  });
});
