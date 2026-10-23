import { createApp } from './app';
import type { Env } from './env';
import { loadUser, sameOrigin } from './lib/http';
import { auth } from './routes/auth';
import { designs } from './routes/designs';

/**
 * API-Worker. Rechnet bewusst nichts Physikalisches (Free Plan: 10 ms CPU pro Request).
 * Alle Requests außerhalb von `/api/*` und `/v/*` liefert Cloudflare direkt als Static Assets aus,
 * ohne diesen Worker aufzurufen (siehe `assets.run_worker_first` in `wrangler.jsonc`).
 */
const app = createApp();

app.get('/api/health', async (c) => {
  let database: 'ok' | 'error' = 'ok';
  try {
    await c.env.DB.prepare('SELECT 1').first();
  } catch {
    database = 'error';
  }
  return c.json(
    { status: 'ok', environment: c.env.ENVIRONMENT, database, auth: !!c.env.SESSION_SECRET },
    200,
    {
      'Cache-Control': 'no-store',
    },
  );
});

app.use('/api/*', sameOrigin, loadUser);
app.route('/', auth);
app.route('/', designs);

app.notFound((c) => {
  // Share-Seiten (`/v/:id`) bekommen später Open-Graph-Tags; bis dahin die SPA ausliefern.
  if (new URL(c.req.url).pathname.startsWith('/v/')) {
    return c.env.ASSETS.fetch(new URL('/', c.req.url));
  }
  return c.json({ error: 'not_found' }, 404);
});

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'internal_error' }, 500);
});

export default app satisfies ExportedHandler<Env>;
