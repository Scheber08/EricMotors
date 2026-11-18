/** Kleine, CPU-sparsame Krypto-Helfer auf Basis von WebCrypto. */

const enc = new TextEncoder();

export const toHex = (bytes: ArrayBuffer | Uint8Array) =>
  [...(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

export function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16);
  return out;
}

export const randomHex = (bytes: number) => toHex(crypto.getRandomValues(new Uint8Array(bytes)));

export async function sha256Hex(...parts: string[]): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(parts.join(''))));
}

/** Vergleich in konstanter Zeit (gleich lange Hex-Strings). */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Passwort-Hash auf dem Server: SHA-256(salt ‖ clientKey). Der Client-Schlüssel ist bereits gestreckt. */
export const hashClientKey = (salt: string, clientKey: string) => sha256Hex(salt, clientKey);

async function hmacKey(secret: string) {
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function hmacHex(secret: string, message: string): Promise<string> {
  return toHex(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(message)));
}
