import { hmacHex, timingSafeEqual } from './crypto';

/**
 * Zustandslose Session als signiertes Cookie: `<userId>.<sessionVersion>.<ablauf>.<hmac>`.
 * Die Session-Version steht auch in der Datenbank; ein Passwortwechsel erhöht sie und macht alte
 * Cookies ungültig.
 */
export const SESSION_COOKIE = 'sm_session';
export const SESSION_TTL_S = 30 * 24 * 3600;

export interface Session {
  userId: string;
  version: number;
  expires: number;
}

export async function signSession(secret: string, s: Session): Promise<string> {
  const payload = `${s.userId}.${s.version}.${s.expires}`;
  return `${payload}.${await hmacHex(secret, payload)}`;
}

export async function verifySession(
  secret: string,
  token: string | undefined,
  now = Date.now(),
): Promise<Session | undefined> {
  if (!token) return undefined;
  const parts = token.split('.');
  if (parts.length !== 4) return undefined;
  const [userId, version, expires, mac] = parts as [string, string, string, string];
  const expected = await hmacHex(secret, `${userId}.${version}.${expires}`);
  if (!timingSafeEqual(mac, expected)) return undefined;
  const exp = Number(expires);
  if (!Number.isFinite(exp) || exp < now) return undefined;
  return { userId, version: Number(version), expires: exp };
}
