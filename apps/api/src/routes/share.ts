import { createApp } from '../app';
import { cached, findDesign, isPublic } from './designs';

/**
 * Teilen-Links `/v/:id`: liefert die SPA mit passenden Open-Graph-Tags aus, damit Messenger und
 * soziale Netzwerke eine Vorschau mit Titel, Kennzahlen und Bild zeigen. Private Entwürfe verraten nichts.
 */
export const share = createApp();

const escape = (s: string) =>
  s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);

share.get('/v/:id', async (c) => {
  const id = c.req.param('id');
  const index = () => c.env.ASSETS.fetch(new URL('/', c.req.url));
  return cached(c, 300, async () => {
    const row = await findDesign(c, id);
    const page = await index();
    if (!row || !isPublic(row))
      return { response: new Response(page.body, page), cacheable: false };
    const origin = new URL(c.req.url).origin;
    const kw = Math.round(row.power_w / 1000);
    const ps = Math.round(row.power_w / 735.49875);
    const facts = [`${kw} kW / ${ps} PS`, `${Math.round(row.mass_kg)} kg`];
    if (row.accel_s) facts.push(`0–100 km/h ${row.accel_s.toFixed(1)} s`);
    const title = `${row.title} – von ${row.owner} | ScheberMotors`;
    const description = (row.description || facts.join(' · ')).slice(0, 200);
    const image = row.thumb_key
      ? `${origin}/api/designs/${row.id}/thumb?v=${/\/v(\d+)\.webp$/.exec(row.thumb_key)?.[1] ?? ''}`
      : null;
    const tags = [
      ['og:title', title],
      ['og:description', description],
      ['og:url', `${origin}/v/${row.id}`],
      ['og:type', 'website'],
      ...(image ? [['og:image', image]] : []),
    ];
    const rewritten = new HTMLRewriter()
      .on('title', { element: (el) => void el.setInnerContent(title) })
      .on('meta[property^="og:"], link[rel="canonical"]', {
        element: (el) => {
          el.remove();
        },
      })
      .on('head', {
        element: (el) => {
          el.append(
            [
              ...tags.map(([p, v]) => `<meta property="${p}" content="${escape(v!)}" />`),
              `<meta name="description" content="${escape(description)}" />`,
              `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}" />`,
              `<link rel="canonical" href="${origin}/v/${row.id}" />`,
            ].join(''),
            { html: true },
          );
        },
      })
      .transform(page);
    return {
      response: new Response(rewritten.body, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }),
      cacheable: true,
    };
  });
});
