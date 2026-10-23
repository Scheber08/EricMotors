import type { Context, MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import type { AppEnv } from '../app';
import { SESSION_COOKIE, verifySession } from './session';

/** Einheitliche Fehlerantwort; `error` ist ein stabiler Code, den das Frontend übersetzt. */
export const fail = (
  c: Context,
  status: 400 | 401 | 403 | 404 | 409 | 413 | 429 | 503,
  error: string,
  extra?: object,
) => c.json({ error, ...extra }, status, { 'Cache-Control': 'no-store' });

export const clientIp = (c: Context) => c.req.header('cf-connecting-ip') ?? 'local';

/** Rate Limit über das Workers-Binding (approximativ pro Standort). */
export async function limited(limiter: RateLimit, key: string): Promise<boolean> {
  try {
    const { success } = await limiter.limit({ key });
    return !success;
  } catch {
    return false; // Limiter nicht verfügbar (z. B. lokal): nicht blockieren
  }
}

/**
 * CSRF-Schutz für schreibende Requests: Der Origin-Header muss zur aufgerufenen Origin passen.
 * Zusammen mit SameSite=Lax-Cookies verhindert das Requests von fremden Seiten.
 */
export const sameOrigin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.req.method === 'GET' || c.req.method === 'HEAD' || c.req.method === 'OPTIONS')
    return next();
  const origin = c.req.header('origin');
  const self = new URL(c.req.url).origin;
  const forwarded = c.req.header('x-forwarded-host');
  const allowed =
    origin === self ||
    (forwarded !== undefined && origin !== undefined && new URL(origin).host === forwarded);
  if (!allowed) return fail(c, 403, 'bad_origin');
  return next();
};

/** Lädt den angemeldeten Nutzer (1 Zeile aus D1), falls ein gültiges Session-Cookie vorliegt. */
export const loadUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  const secret = c.env.SESSION_SECRET;
  if (secret) {
    const session = await verifySession(secret, getCookie(c, SESSION_COOKIE));
    if (session) {
      const row = await c.env.DB.prepare(
        'SELECT id, username, session_version, banned, design_count FROM users WHERE id = ?',
      )
        .bind(session.userId)
        .first<{
          id: string;
          username: string;
          session_version: number;
          banned: number;
          design_count: number;
        }>();
      if (row && row.session_version === session.version && !row.banned) {
        c.set('user', {
          id: row.id,
          username: row.username,
          designCount: row.design_count,
          sessionVersion: row.session_version,
        });
      }
    }
  }
  await next();
};

export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get('user')) return fail(c, 401, 'unauthorized');
  return next();
};
