import { describe, expect, it } from 'vitest';
import { fromHex, hashClientKey, randomHex, timingSafeEqual, toHex } from './crypto';
import { signSession, verifySession } from './session';

describe('Krypto-Helfer', () => {
  it('Hex hin und zurück, Zufallswerte haben die richtige Länge', () => {
    expect(toHex(fromHex('00ff10ab'))).toBe('00ff10ab');
    expect(randomHex(16)).toMatch(/^[0-9a-f]{32}$/);
  });

  it('Vergleich in konstanter Zeit', () => {
    expect(timingSafeEqual('abcd', 'abcd')).toBe(true);
    expect(timingSafeEqual('abcd', 'abce')).toBe(false);
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
  });

  it('Server-Hash ist gesalzen', async () => {
    const key = 'a'.repeat(64);
    expect(await hashClientKey('salt1', key)).not.toBe(await hashClientKey('salt2', key));
  });
});

describe('Session-Cookie', () => {
  const secret = 'test-secret';
  it('signiert und prüft', async () => {
    const token = await signSession(secret, {
      userId: 'u1',
      version: 0,
      expires: Date.now() + 1000,
    });
    expect((await verifySession(secret, token))?.userId).toBe('u1');
  });
  it('lehnt Manipulation, falsches Geheimnis und Ablauf ab', async () => {
    const token = await signSession(secret, {
      userId: 'u1',
      version: 0,
      expires: Date.now() + 1000,
    });
    expect(await verifySession(secret, token.replace('u1', 'u2'))).toBeUndefined();
    expect(await verifySession('other', token)).toBeUndefined();
    expect(await verifySession(secret, token, Date.now() + 5000)).toBeUndefined();
    expect(await verifySession(secret, 'kaputt')).toBeUndefined();
  });
});
