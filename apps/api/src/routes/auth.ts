import { deleteCookie, setCookie } from 'hono/cookie';
import type { Context } from 'hono';
import { AuthRequest, ChangePasswordRequest } from '@ericmotors/schema';
import { type AppEnv, createApp } from '../app';
import { hashClientKey, randomHex, timingSafeEqual } from '../lib/crypto';
import { clientIp, fail, limited, requireUser } from '../lib/http';
import { SESSION_COOKIE, SESSION_TTL_S, signSession } from '../lib/session';

/**
 * Login mit Benutzername + Passwort. Der Browser schickt nur den mit PBKDF2 gestreckten Schlüssel;
 * hier wird lediglich SHA-256(salt ‖ key) gerechnet (CPU-sparsam für den Free Plan).
 */
export const auth = createApp();

async function startSession(c: Context<AppEnv>, userId: string, version: number) {
  const secret = c.env.SESSION_SECRET!;
  const token = await signSession(secret, {
    userId,
    version,
    expires: Date.now() + SESSION_TTL_S * 1000,
  });
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === 'https:',
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_S,
  });
}

const publicUser = (u: {
  id: string;
  username: string;
  design_count?: number;
  designCount?: number;
}) => ({
  id: u.id,
  username: u.username,
  designCount: u.design_count ?? u.designCount ?? 0,
});

auth.use('*', async (c, next) => {
  if (!c.env.SESSION_SECRET && c.req.path !== '/api/me') return fail(c, 503, 'auth_not_configured');
  return next();
});

auth.post('/api/auth/register', async (c) => {
  if (await limited(c.env.AUTH_LIMITER, `register:${clientIp(c)}`))
    return fail(c, 429, 'rate_limited');
  const body = AuthRequest.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return fail(c, 400, 'invalid_input');
  const { username, key } = body.data;
  const salt = randomHex(16);
  const id = crypto.randomUUID();
  try {
    await c.env.DB.prepare(
      'INSERT INTO users (id, username, username_lower, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
      .bind(id, username, username.toLowerCase(), await hashClientKey(salt, key), salt, Date.now())
      .run();
  } catch (e) {
    if (String(e).includes('UNIQUE')) return fail(c, 409, 'username_taken');
    throw e;
  }
  await startSession(c, id, 0);
  return c.json({ user: publicUser({ id, username }) }, 201);
});

auth.post('/api/auth/login', async (c) => {
  const body = AuthRequest.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return fail(c, 400, 'invalid_input');
  const { username, key } = body.data;
  if (
    (await limited(c.env.AUTH_LIMITER, `login:${clientIp(c)}`)) ||
    (await limited(c.env.AUTH_LIMITER, `login-user:${username.toLowerCase()}`))
  ) {
    return fail(c, 429, 'rate_limited');
  }
  const row = await c.env.DB.prepare(
    'SELECT id, username, password_hash, password_salt, session_version, banned, design_count FROM users WHERE username_lower = ?',
  )
    .bind(username.toLowerCase())
    .first<{
      id: string;
      username: string;
      password_hash: string;
      password_salt: string;
      session_version: number;
      banned: number;
      design_count: number;
    }>();
  // Auch bei unbekanntem Namen einen Hash rechnen, damit die Antwortzeit nichts verrät.
  const hash = await hashClientKey(row?.password_salt ?? '0'.repeat(32), key);
  if (!row || !timingSafeEqual(hash, row.password_hash)) return fail(c, 401, 'invalid_credentials');
  if (row.banned) return fail(c, 403, 'banned');
  await startSession(c, row.id, row.session_version);
  return c.json({ user: publicUser(row) });
});

auth.post('/api/auth/logout', (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
  return c.json({ ok: true });
});

auth.post('/api/auth/password', requireUser, async (c) => {
  const user = c.get('user')!;
  if (await limited(c.env.AUTH_LIMITER, `password:${user.id}`)) return fail(c, 429, 'rate_limited');
  const body = ChangePasswordRequest.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return fail(c, 400, 'invalid_input');
  const row = await c.env.DB.prepare('SELECT password_hash, password_salt FROM users WHERE id = ?')
    .bind(user.id)
    .first<{ password_hash: string; password_salt: string }>();
  if (
    !row ||
    !timingSafeEqual(await hashClientKey(row.password_salt, body.data.oldKey), row.password_hash)
  ) {
    return fail(c, 401, 'invalid_credentials');
  }
  const salt = randomHex(16);
  const version = user.sessionVersion + 1;
  await c.env.DB.prepare(
    'UPDATE users SET password_hash = ?, password_salt = ?, session_version = ? WHERE id = ?',
  )
    .bind(await hashClientKey(salt, body.data.newKey), salt, version, user.id)
    .run();
  await startSession(c, user.id, version);
  return c.json({ ok: true });
});

auth.get('/api/me', (c) => {
  const user = c.get('user');
  return c.json(
    { user: user ? publicUser(user) : null, authAvailable: !!c.env.SESSION_SECRET },
    200,
    { 'Cache-Control': 'private, no-store' },
  );
});

auth.delete('/api/me', requireUser, async (c) => {
  const user = c.get('user')!;
  const keys = await c.env.DB.prepare('SELECT data_key, thumb_key FROM designs WHERE owner_id = ?')
    .bind(user.id)
    .all<{ data_key: string; thumb_key: string | null }>();
  const r2Keys = keys.results.flatMap((k) => [k.data_key, ...(k.thumb_key ? [k.thumb_key] : [])]);
  // R2-Löschungen sind kostenlos; ein Aufruf löscht bis zu 1000 Schlüssel.
  if (r2Keys.length) await c.env.BUCKET.delete(r2Keys);
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM likes WHERE user_id = ?').bind(user.id),
    c.env.DB.prepare('DELETE FROM reports WHERE reporter_id = ?').bind(user.id),
    c.env.DB.prepare('DELETE FROM designs WHERE owner_id = ?').bind(user.id),
    c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id),
  ]);
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
  return c.json({ ok: true });
});
