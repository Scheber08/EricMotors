import type { Context } from 'hono';
import {
  type DesignMeta,
  DesignUpload,
  type GalleryPage,
  GalleryQuery,
  ReportReason,
  Username,
  migrateCar,
  migrateEngine,
} from '@ericmotors/schema';
import { type AppEnv, createApp } from '../app';
import { fail, limited, requireUser } from '../lib/http';

/**
 * Entwürfe (Autos und Motoren) in der Cloud. Metadaten in D1, Dokumente und Vorschaubilder in R2.
 * Öffentliche Antworten werden über die Cache API gecacht, um Worker-CPU und D1-Lesezugriffe zu sparen.
 */
export const designs = createApp();

interface DesignRow {
  id: string;
  kind: 'car' | 'engine';
  owner_id: string;
  owner: string;
  title: string;
  description: string;
  visibility: 'private' | 'unlisted' | 'public';
  version: number;
  data_key: string;
  thumb_key: string | null;
  power_w: number;
  torque_nm: number;
  mass_kg: number;
  accel_s: number | null;
  top_speed_ms: number | null;
  cost_eur: number;
  category: string | null;
  layout: string | null;
  fork_of: string | null;
  like_count: number;
  hidden: number;
  created_at: number;
  updated_at: number;
  published_at: number | null;
}

const SELECT = `SELECT d.*, u.username AS owner FROM designs d JOIN users u ON u.id = d.owner_id`;
const ID = /^[0-9a-f-]{36}$/;
const MAX_THUMB_BYTES = 150 * 1024;
const PAGE_SIZE = 24;
/** Ab so vielen Meldungen wird ein Entwurf automatisch ausgeblendet (bis zur Prüfung). */
const AUTO_HIDE_REPORTS = 5;

export function toMeta(r: DesignRow): DesignMeta {
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    description: r.description,
    visibility: r.visibility,
    owner: r.owner,
    version: r.version,
    stats: {
      powerW: r.power_w,
      torqueNm: r.torque_nm,
      massKg: r.mass_kg,
      accelS: r.accel_s,
      topSpeedMs: r.top_speed_ms,
      costEur: r.cost_eur,
    },
    category: r.category,
    layout: r.layout,
    forkOf: r.fork_of,
    likes: r.like_count,
    thumbVersion: r.thumb_key ? Number(/\/v(\d+)\.webp$/.exec(r.thumb_key)?.[1] ?? 0) : null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    publishedAt: r.published_at,
  };
}

/** Darf der aktuelle Nutzer den Entwurf sehen? Privat nur für den Eigentümer; ausgeblendet nur für ihn. */
function canView(c: Context<AppEnv>, r: DesignRow): boolean {
  const own = c.get('user')?.id === r.owner_id;
  return own || (r.visibility !== 'private' && !r.hidden);
}

async function findDesign(c: Context<AppEnv>, id: string): Promise<DesignRow | null> {
  if (!ID.test(id)) return null;
  return c.env.DB.prepare(`${SELECT} WHERE d.id = ?`).bind(id).first<DesignRow>();
}

/**
 * Liefert eine gecachte Antwort oder erzeugt eine neue. Nur Antworten, die `produce` ausdrücklich als
 * öffentlich markiert, landen im Cache – private Inhalte nie.
 */
async function cached(
  c: Context<AppEnv>,
  ttl: number,
  produce: () => Promise<{ response: Response; cacheable: boolean } | null>,
): Promise<Response> {
  const cache = (caches as unknown as { default: Cache }).default;
  const key = new Request(c.req.url, { method: 'GET' });
  const hit = await cache.match(key);
  if (hit) return hit;
  const result = await produce();
  if (!result) return fail(c, 404, 'not_found');
  const { response, cacheable } = result;
  if (cacheable && response.ok) {
    response.headers.set('Cache-Control', `public, max-age=${ttl}`);
    c.executionCtx.waitUntil(cache.put(key, response.clone()));
  } else {
    response.headers.set('Cache-Control', 'private, no-store');
  }
  return response;
}

const isPublic = (r: DesignRow) => r.visibility !== 'private' && !r.hidden;

// ---------- Speichern ----------

designs.put('/api/designs/:id', requireUser, async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');
  if (!ID.test(id)) return fail(c, 400, 'invalid_id');
  if (await limited(c.env.WRITE_LIMITER, `write:${user.id}`)) return fail(c, 429, 'rate_limited');

  const maxBytes = Number(c.env.MAX_DESIGN_BYTES);
  const raw = await c.req.text();
  if (raw.length > maxBytes) return fail(c, 413, 'too_large');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fail(c, 400, 'invalid_json');
  }
  const upload = DesignUpload.safeParse(parsed);
  if (!upload.success) return fail(c, 400, 'invalid_input');
  const { kind, visibility, stats } = upload.data;

  // Strenge Validierung des Dokuments mit demselben Schema wie im Browser.
  let docJson: string;
  let title: string;
  let description: string;
  let category: string;
  let layout: string;
  let forkOf: string | null;
  let schemaVersion: number;
  try {
    if (kind === 'car') {
      const car = migrateCar(upload.data.doc);
      if (car.id !== id) return fail(c, 400, 'id_mismatch');
      docJson = JSON.stringify(car);
      title = car.meta.name;
      description = car.meta.description;
      category = car.model.shape;
      layout = car.drivetrain.layout;
      forkOf = car.meta.forkOf?.id ?? null;
      schemaVersion = car.schemaVersion;
    } else {
      const engine = migrateEngine(upload.data.doc);
      if (engine.id !== id) return fail(c, 400, 'id_mismatch');
      docJson = JSON.stringify(engine);
      title = engine.meta.name;
      description = engine.meta.description;
      category = engine.family.layout;
      layout = engine.variants[0]!.fuel;
      forkOf = engine.meta.forkOf?.id ?? null;
      schemaVersion = engine.schemaVersion;
    }
  } catch {
    return fail(c, 400, 'invalid_document');
  }

  const existing = await c.env.DB.prepare(
    'SELECT owner_id, kind, version, data_key, published_at FROM designs WHERE id = ?',
  )
    .bind(id)
    .first<{
      owner_id: string;
      kind: string;
      version: number;
      data_key: string;
      published_at: number | null;
    }>();
  if (existing && existing.owner_id !== user.id) return fail(c, 403, 'forbidden');
  if (existing && existing.kind !== kind) return fail(c, 400, 'kind_mismatch');
  if (!existing && user.designCount >= Number(c.env.MAX_DESIGNS_PER_USER)) {
    return fail(c, 409, 'quota_exceeded', { limit: Number(c.env.MAX_DESIGNS_PER_USER) });
  }

  const now = Date.now();
  const version = (existing?.version ?? 0) + 1;
  const dataKey = `designs/${id}/v${version}.json`;
  await c.env.BUCKET.put(dataKey, docJson, { httpMetadata: { contentType: 'application/json' } });
  const publishedAt = existing?.published_at ?? (visibility === 'public' ? now : null);
  const values = [
    title,
    description,
    visibility,
    schemaVersion,
    version,
    dataKey,
    stats.powerW,
    stats.torqueNm,
    stats.massKg,
    stats.accelS,
    stats.topSpeedMs,
    stats.costEur,
    category,
    layout,
    forkOf,
    now,
    publishedAt,
  ];

  if (existing) {
    await c.env.DB.prepare(
      `UPDATE designs SET title = ?, description = ?, visibility = ?, schema_version = ?, version = ?, data_key = ?,
       power_w = ?, torque_nm = ?, mass_kg = ?, accel_s = ?, top_speed_ms = ?, cost_eur = ?, category = ?, layout = ?,
       fork_of = ?, updated_at = ?, published_at = ? WHERE id = ?`,
    )
      .bind(...values, id)
      .run();
    c.executionCtx.waitUntil(c.env.BUCKET.delete(existing.data_key));
  } else {
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO designs (title, description, visibility, schema_version, version, data_key, power_w, torque_nm, mass_kg,
         accel_s, top_speed_ms, cost_eur, category, layout, fork_of, updated_at, published_at, id, kind, owner_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(...values, id, kind, user.id, now),
      c.env.DB.prepare('UPDATE users SET design_count = design_count + 1 WHERE id = ?').bind(
        user.id,
      ),
    ]);
  }
  const row = await findDesign(c, id);
  return c.json({ design: toMeta(row!) }, existing ? 200 : 201);
});

designs.put('/api/designs/:id/thumb', requireUser, async (c) => {
  const user = c.get('user')!;
  const row = await findDesign(c, c.req.param('id'));
  if (!row) return fail(c, 404, 'not_found');
  if (row.owner_id !== user.id) return fail(c, 403, 'forbidden');
  if (await limited(c.env.WRITE_LIMITER, `write:${user.id}`)) return fail(c, 429, 'rate_limited');
  const bytes = new Uint8Array(await c.req.arrayBuffer());
  if (bytes.length > MAX_THUMB_BYTES) return fail(c, 413, 'too_large');
  // WebP-Signatur: "RIFF" .... "WEBP"
  const sig =
    String.fromCharCode(...bytes.slice(0, 4)) + String.fromCharCode(...bytes.slice(8, 12));
  if (sig !== 'RIFFWEBP') return fail(c, 400, 'invalid_image');
  const key = `thumbs/${row.id}/v${row.version}.webp`;
  await c.env.BUCKET.put(key, bytes, { httpMetadata: { contentType: 'image/webp' } });
  await c.env.DB.prepare('UPDATE designs SET thumb_key = ? WHERE id = ?').bind(key, row.id).run();
  if (row.thumb_key && row.thumb_key !== key)
    c.executionCtx.waitUntil(c.env.BUCKET.delete(row.thumb_key));
  return c.json({ ok: true });
});

designs.delete('/api/designs/:id', requireUser, async (c) => {
  const user = c.get('user')!;
  const row = await findDesign(c, c.req.param('id'));
  if (!row) return fail(c, 404, 'not_found');
  if (row.owner_id !== user.id) return fail(c, 403, 'forbidden');
  await c.env.BUCKET.delete([row.data_key, ...(row.thumb_key ? [row.thumb_key] : [])]);
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM likes WHERE design_id = ?').bind(row.id),
    c.env.DB.prepare('DELETE FROM reports WHERE design_id = ?').bind(row.id),
    c.env.DB.prepare('DELETE FROM designs WHERE id = ?').bind(row.id),
    c.env.DB.prepare('UPDATE users SET design_count = MAX(0, design_count - 1) WHERE id = ?').bind(
      user.id,
    ),
  ]);
  return c.json({ ok: true });
});

// ---------- Lesen ----------

designs.get('/api/designs', requireUser, async (c) => {
  const rows = await c.env.DB.prepare(
    `${SELECT} WHERE d.owner_id = ? ORDER BY d.updated_at DESC LIMIT 100`,
  )
    .bind(c.get('user')!.id)
    .all<DesignRow>();
  return c.json({ items: rows.results.map(toMeta) }, 200, { 'Cache-Control': 'private, no-store' });
});

designs.get('/api/designs/:id', async (c) => {
  const user = c.get('user');
  if (!user) {
    // Anonyme Anfragen sind für alle gleich und dürfen kurz gecacht werden.
    return cached(c, 60, async () => {
      const row = await findDesign(c, c.req.param('id'));
      return row && canView(c, row)
        ? { response: c.json({ design: toMeta(row) }), cacheable: isPublic(row) }
        : null;
    });
  }
  const row = await findDesign(c, c.req.param('id'));
  if (!row || !canView(c, row)) return fail(c, 404, 'not_found');
  const liked = await c.env.DB.prepare('SELECT 1 FROM likes WHERE user_id = ? AND design_id = ?')
    .bind(user.id, row.id)
    .first();
  return c.json({ design: { ...toMeta(row), likedByMe: !!liked } }, 200, {
    'Cache-Control': 'private, no-store',
  });
});

/** Dokument-JSON. Öffentliche Versionen sind unveränderlich (Version im Schlüssel) und dauerhaft cachebar. */
designs.get('/api/designs/:id/data', async (c) => {
  const row = await findDesign(c, c.req.param('id'));
  if (!row || !canView(c, row)) return fail(c, 404, 'not_found');
  const object = await c.env.BUCKET.get(row.data_key);
  if (!object) return fail(c, 404, 'not_found');
  return new Response(object.body, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control':
        isPublic(row) && c.req.query('v') === String(row.version)
          ? 'public, max-age=31536000, immutable'
          : 'private, no-store',
    },
  });
});

designs.get('/api/designs/:id/thumb', async (c) => {
  const v = c.req.query('v');
  // Mit passender Bildversion unveränderlich; gecacht wird nur bei öffentlichen Entwürfen.
  return cached(c, 86400, async () => {
    const row = await findDesign(c, c.req.param('id'));
    if (!row?.thumb_key || !canView(c, row)) return null;
    const object = await c.env.BUCKET.get(row.thumb_key);
    if (!object) return null;
    return {
      response: new Response(object.body, { headers: { 'Content-Type': 'image/webp' } }),
      cacheable: isPublic(row) && v !== undefined && row.thumb_key.endsWith(`/v${v}.webp`),
    };
  });
});

designs.get('/api/gallery', async (c) => {
  const q = GalleryQuery.safeParse(c.req.query());
  if (!q.success) return fail(c, 400, 'invalid_input');
  return cached(c, 60, async () => {
    const { kind, sort, category, layout, minPowerW, maxMassKg, cursor } = q.data;
    const where = ['d.kind = ?', "d.visibility = 'public'", 'd.hidden = 0'];
    const binds: (string | number)[] = [kind];
    const add = (clause: string, ...values: (string | number)[]) => {
      where.push(clause);
      binds.push(...values);
    };
    if (category) add('d.category = ?', category);
    if (layout) add('d.layout = ?', layout);
    if (minPowerW !== undefined) add('d.power_w >= ?', minPowerW);
    if (maxMassKg !== undefined) add('d.mass_kg <= ?', maxMassKg);
    // Keyset-Pagination: liest nur so viele Zeilen wie nötig (kein OFFSET).
    if (cursor) {
      const [a, b] = cursor.split('_');
      if (sort === 'recent') add('d.published_at < ?', Number(a));
      else
        add('(d.like_count < ? OR (d.like_count = ? AND d.id > ?))', Number(a), Number(a), b ?? '');
    }
    const order = sort === 'recent' ? 'd.published_at DESC' : 'd.like_count DESC, d.id ASC';
    const rows = await c.env.DB.prepare(
      `${SELECT} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ${PAGE_SIZE + 1}`,
    )
      .bind(...binds)
      .all<DesignRow>();
    const items = rows.results.slice(0, PAGE_SIZE);
    const last = items.at(-1);
    const nextCursor =
      rows.results.length > PAGE_SIZE && last
        ? sort === 'recent'
          ? String(last.published_at)
          : `${last.like_count}_${last.id}`
        : null;
    return {
      response: c.json({ items: items.map(toMeta), nextCursor } satisfies GalleryPage),
      cacheable: true,
    };
  });
});

designs.get('/api/users/:username/designs', async (c) => {
  const name = Username.safeParse(c.req.param('username'));
  if (!name.success) return fail(c, 404, 'not_found');
  const own = c.get('user')?.username.toLowerCase() === name.data.toLowerCase();
  const rows = await c.env.DB.prepare(
    `${SELECT} WHERE u.username_lower = ? ${own ? '' : "AND d.visibility = 'public' AND d.hidden = 0"} ORDER BY d.updated_at DESC LIMIT 100`,
  )
    .bind(name.data.toLowerCase())
    .all<DesignRow>();
  const exists =
    rows.results.length > 0 ||
    (await c.env.DB.prepare('SELECT 1 FROM users WHERE username_lower = ?')
      .bind(name.data.toLowerCase())
      .first());
  if (!exists) return fail(c, 404, 'not_found');
  return c.json({ items: rows.results.map(toMeta) }, 200, {
    'Cache-Control': 'private, max-age=30',
  });
});

// ---------- Likes und Meldungen ----------

designs.post('/api/designs/:id/like', requireUser, async (c) => {
  const user = c.get('user')!;
  if (await limited(c.env.WRITE_LIMITER, `write:${user.id}`)) return fail(c, 429, 'rate_limited');
  const row = await findDesign(c, c.req.param('id'));
  if (!row || !canView(c, row)) return fail(c, 404, 'not_found');
  const res = await c.env.DB.prepare(
    'INSERT OR IGNORE INTO likes (user_id, design_id, created_at) VALUES (?, ?, ?)',
  )
    .bind(user.id, row.id, Date.now())
    .run();
  if (res.meta.changes > 0)
    await c.env.DB.prepare('UPDATE designs SET like_count = like_count + 1 WHERE id = ?')
      .bind(row.id)
      .run();
  return c.json({ likes: row.like_count + (res.meta.changes > 0 ? 1 : 0), likedByMe: true });
});

designs.delete('/api/designs/:id/like', requireUser, async (c) => {
  const user = c.get('user')!;
  if (await limited(c.env.WRITE_LIMITER, `write:${user.id}`)) return fail(c, 429, 'rate_limited');
  const row = await findDesign(c, c.req.param('id'));
  if (!row) return fail(c, 404, 'not_found');
  const res = await c.env.DB.prepare('DELETE FROM likes WHERE user_id = ? AND design_id = ?')
    .bind(user.id, row.id)
    .run();
  if (res.meta.changes > 0)
    await c.env.DB.prepare('UPDATE designs SET like_count = MAX(0, like_count - 1) WHERE id = ?')
      .bind(row.id)
      .run();
  return c.json({
    likes: Math.max(0, row.like_count - (res.meta.changes > 0 ? 1 : 0)),
    likedByMe: false,
  });
});

designs.post('/api/designs/:id/report', requireUser, async (c) => {
  const user = c.get('user')!;
  if (await limited(c.env.WRITE_LIMITER, `write:${user.id}`)) return fail(c, 429, 'rate_limited');
  const reason = ReportReason.safeParse((await c.req.json().catch(() => ({}))).reason);
  if (!reason.success) return fail(c, 400, 'invalid_input');
  const row = await findDesign(c, c.req.param('id'));
  if (!row || !canView(c, row)) return fail(c, 404, 'not_found');
  if (row.owner_id === user.id) return fail(c, 400, 'own_design');
  const res = await c.env.DB.prepare(
    'INSERT OR IGNORE INTO reports (design_id, reporter_id, reason, created_at) VALUES (?, ?, ?, ?)',
  )
    .bind(row.id, user.id, reason.data, Date.now())
    .run();
  if (res.meta.changes > 0) {
    await c.env.DB.prepare(
      `UPDATE designs SET report_count = report_count + 1, hidden = CASE WHEN report_count + 1 >= ? THEN 1 ELSE hidden END WHERE id = ?`,
    )
      .bind(AUTO_HIDE_REPORTS, row.id)
      .run();
  }
  return c.json({ ok: true });
});
