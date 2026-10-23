// Smoke-Test gegen einen laufenden Worker (lokal: `npm run dev -w @ericmotors/api`).
// Aufruf: npm run smoke -w @ericmotors/api [-- http://127.0.0.1:8787]
import { CAR_TEMPLATES, ENGINE_TEMPLATES } from '@ericmotors/schema';

type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const base = process.argv[2] ?? 'http://127.0.0.1:8787';
let cookie = '';
let failures = 0;

async function call(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; json: Json; headers: Headers }> {
  const res = await fetch(base + path, {
    method,
    headers: {
      'content-type': 'application/json',
      origin: base,
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
    body:
      body === undefined
        ? undefined
        : typeof body === 'string' || body instanceof Uint8Array
          ? body
          : JSON.stringify(body),
  });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0]!.endsWith('=') ? '' : set.split(';')[0]!;
  const text = await res.text();
  let json: Json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json, headers: res.headers };
}

function expect(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.log(`  ✗ ${name}`, detail ?? '');
  }
}

async function key(username: string, password: string) {
  const enc = new TextEncoder();
  const material = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: enc.encode('schebermotors/v1/' + username.toLowerCase()),
      iterations: 1000,
    },
    material,
    256,
  );
  return Buffer.from(bits).toString('hex');
}

const user = `smoke_${Date.now() % 1e6}`;
console.log(`Smoke-Test gegen ${base} als ${user}`);

console.log('Auth');
let r = await call('GET', '/api/me');
expect('anonym: user = null', r.status === 200 && r.json.user === null, r.json);
r = await call(
  'POST',
  '/api/auth/register',
  { username: user, key: await key(user, 'geheim123') },
  { origin: 'https://evil.example' },
);
expect('fremde Origin wird abgelehnt', r.status === 403, r.json);
r = await call('POST', '/api/auth/register', { username: user, key: await key(user, 'geheim123') });
expect('Registrieren', r.status === 201 && r.json.user.username === user, r.json);
r = await call('GET', '/api/me');
expect('angemeldet nach Registrierung', r.json.user?.username === user, r.json);
r = await call('POST', '/api/auth/register', {
  username: user.toUpperCase(),
  key: await key(user, 'x'),
});
expect('Name ohne Groß/klein eindeutig', r.status === 409, r.json);
await call('POST', '/api/auth/logout');
r = await call('GET', '/api/me');
expect('abgemeldet', r.json.user === null, r.json);
r = await call('POST', '/api/auth/login', { username: user, key: await key(user, 'falsch') });
expect('falsches Passwort', r.status === 401, r.json);
r = await call('POST', '/api/auth/login', {
  username: user.toUpperCase(),
  key: await key(user, 'geheim123'),
});
expect('Login (Groß/klein egal)', r.status === 200, r.json);
const oldCookie = cookie;
r = await call('POST', '/api/auth/password', {
  oldKey: await key(user, 'geheim123'),
  newKey: await key(user, 'neu12345'),
});
expect('Passwort ändern', r.status === 200, r.json);
const newCookie = cookie;
cookie = oldCookie;
r = await call('GET', '/api/me');
expect('alte Session nach Passwortwechsel ungültig', r.json.user === null, r.json);
cookie = newCookie;
r = await call('GET', '/api/me');
expect('neue Session gültig', r.json.user?.username === user, r.json);

console.log('Entwürfe');
const car = { ...CAR_TEMPLATES['hot-hatch'](), id: crypto.randomUUID() };
const stats = {
  powerW: 190e3,
  torqueNm: 340,
  massKg: 1350,
  accelS: 6.3,
  topSpeedMs: 70,
  costEur: 24000,
};
r = await call('PUT', `/api/designs/${car.id}`, {
  kind: 'car',
  visibility: 'public',
  doc: car,
  stats,
});
expect('Auto speichern (öffentlich)', r.status === 201 && r.json.design.version === 1, r.json);
r = await call('PUT', `/api/designs/${car.id}`, {
  kind: 'car',
  visibility: 'public',
  doc: { ...car, model: { ...car.model, shape: 'boat' } },
  stats,
});
expect(
  'ungültiges Dokument abgelehnt',
  r.status === 400 && r.json.error === 'invalid_document',
  r.json,
);
r = await call('PUT', `/api/designs/${car.id}`, {
  kind: 'car',
  visibility: 'public',
  doc: car,
  stats: { ...stats, powerW: 1e9 },
});
expect('unplausible Kennzahlen abgelehnt', r.status === 400, r.json);
r = await call('PUT', `/api/designs/${car.id}`, {
  kind: 'car',
  visibility: 'public',
  doc: { ...car, meta: { ...car.meta, name: 'Smoke GTI' } },
  stats,
});
expect(
  'Auto aktualisieren → Version 2',
  r.status === 200 && r.json.design.version === 2 && r.json.design.title === 'Smoke GTI',
  r.json,
);
const webp = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
]);
r = await call('PUT', `/api/designs/${car.id}/thumb`, webp, { 'content-type': 'image/webp' });
expect('Vorschaubild hochladen', r.status === 200, r.json);
r = await call(
  'PUT',
  `/api/designs/${car.id}/thumb`,
  new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
  { 'content-type': 'image/webp' },
);
expect('kein WebP → abgelehnt', r.status === 400, r.json);
r = await call('GET', `/v/${car.id}`);
expect(
  'Teilen-Seite mit Open-Graph-Tags',
  typeof r.json === 'string' &&
    r.json.includes('property="og:title" content="Smoke GTI') &&
    r.json.includes('og:image'),
  typeof r.json === 'string' ? r.json.slice(0, 300) : r.json,
);
r = await call('GET', '/v/00000000-0000-4000-8000-000000000000');
expect(
  'Teilen-Seite unbekannt → normale App',
  r.status === 200 && typeof r.json === 'string' && r.json.includes('<div id="root">'),
  r.status,
);
r = await call('GET', `/api/designs/${car.id}/data?v=2`);
expect('Daten laden', r.status === 200 && r.json.meta.name === 'Smoke GTI', r.json);
const engine = { ...ENGINE_TEMPLATES['v8-50-na'](), id: crypto.randomUUID() };
r = await call('PUT', `/api/designs/${engine.id}`, {
  kind: 'engine',
  visibility: 'private',
  doc: engine,
  stats: { ...stats, accelS: null, topSpeedMs: null, massKg: 228 },
});
expect('Motor speichern (privat)', r.status === 201, r.json);
r = await call('GET', '/api/designs');
expect('eigene Entwürfe: 2', r.json.items?.length === 2, r.json);
// Laufspezifischer Filter, damit der 60-s-Galerie-Cache eines früheren Laufs nicht greift.
const probe = 1000 + Math.floor(Math.random() * 1e5);
r = await call('GET', `/api/gallery?kind=car&minPowerW=${probe}`);
expect(
  'Galerie enthält das öffentliche Auto',
  r.json.items?.some((d: Json) => d.id === car.id),
  r.json,
);
r = await call('GET', `/api/gallery?kind=engine&minPowerW=${probe}`);
expect(
  'Galerie enthält den privaten Motor nicht',
  !r.json.items?.some((d: Json) => d.id === engine.id),
  r.json,
);
r = await call('GET', `/api/users/${user}/designs`);
expect('Profil (eigenes) zeigt beide', r.json.items?.length === 2, r.json);

console.log('Likes, Meldungen, fremde Nutzer');
r = await call('POST', `/api/designs/${car.id}/like`);
expect('Like', r.json.likes === 1 && r.json.likedByMe === true, r.json);
r = await call('POST', `/api/designs/${car.id}/like`);
expect('doppeltes Like zählt nicht', r.json.likes === 1, r.json);
r = await call('DELETE', `/api/designs/${car.id}/like`);
expect('Like zurücknehmen', r.json.likes === 0, r.json);
const ownerCookie = cookie;
cookie = '';
const other = `${user}_b`;
await call('POST', '/api/auth/register', { username: other, key: await key(other, 'geheim123') });
r = await call('GET', `/api/designs/${engine.id}`);
expect('privater Motor für Fremde unsichtbar', r.status === 404, r.json);
r = await call('PUT', `/api/designs/${car.id}`, {
  kind: 'car',
  visibility: 'public',
  doc: car,
  stats,
});
expect('fremdes Auto überschreiben verboten', r.status === 403, r.json);
r = await call('POST', `/api/designs/${car.id}/report`, { reason: 'spam' });
expect('Melden', r.status === 200, r.json);
r = await call('GET', `/api/users/${user}/designs`);
expect('fremdes Profil zeigt nur Öffentliches', r.json.items?.length === 1, r.json);
r = await call('DELETE', '/api/me');
expect('Konto löschen', r.status === 200, r.json);
cookie = ownerCookie;
r = await call('DELETE', `/api/designs/${engine.id}`);
expect('Motor löschen', r.status === 200, r.json);
r = await call('DELETE', '/api/me');
expect('Testkonto aufräumen', r.status === 200, r.json);

console.log(failures ? `\n${failures} Fehler` : '\nAlles OK');
process.exit(failures ? 1 : 0);
