// Smoke-Test gegen einen laufenden Worker (lokal: `npm run dev -w @ericmotors/api`).
// Aufruf: node apps/api/scripts/smoke.mjs [http://127.0.0.1:8787]
const base = process.argv[2] ?? 'http://127.0.0.1:8787';
let cookie = '';
let failures = 0;

async function call(method, path, body, headers = {}) {
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
  if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json, headers: res.headers };
}

function expect(name, cond, detail) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.log(`  ✗ ${name}`, detail ?? '');
  }
}

async function key(username, password) {
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

console.log(failures ? `\n${failures} Fehler` : '\nAlles OK');
process.exit(failures ? 1 : 0);
