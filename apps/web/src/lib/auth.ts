import { AUTH_PBKDF2_ITERATIONS, AUTH_SALT_PREFIX } from '@ericmotors/schema';

/** Leitet den Client-Schlüssel ab (läuft im Browser über WebCrypto). */
export async function deriveClientKey(
  username: string,
  password: string,
  iterations = AUTH_PBKDF2_ITERATIONS,
): Promise<string> {
  const enc = new TextEncoder();
  const material = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: enc.encode(AUTH_SALT_PREFIX + username.trim().toLowerCase()),
      iterations,
    },
    material,
    256,
  );
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
