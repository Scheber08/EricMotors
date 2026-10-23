import { z } from 'zod';

/**
 * Login mit Benutzername + Passwort, passend zum Cloudflare-Free-Plan (10 ms CPU pro Request):
 * Das teure Key-Stretching passiert im Browser, der Server rechnet nur noch einen SHA-256.
 *
 *   clientKey = PBKDF2-SHA-256(Passwort, Salz = AUTH_SALT_PREFIX + username_lower, 600 000 Runden, 256 Bit)
 *   gespeichert = SHA-256(zufälliges Server-Salz ‖ clientKey)
 *
 * Das Klartext-Passwort verlässt den Browser nie. Wer die Datenbank erbeutet, muss pro Rateversuch
 * die 600 000 PBKDF2-Runden rechnen (OWASP Password Storage Cheat Sheet, 2023).
 */
export const AUTH_PBKDF2_ITERATIONS = 600_000;
export const AUTH_SALT_PREFIX = 'schebermotors/v1/';

export const Username = z
  .string()
  .trim()
  .min(3)
  .max(24)
  .regex(/^[a-zA-Z0-9_-]+$/, 'nur Buchstaben, Ziffern, _ und -');

/** Mindestanforderung an das Passwort (wird nur im Browser geprüft, der Server sieht es nie). */
export const PASSWORD_MIN_LENGTH = 8;

/** Vom Browser abgeleiteter Schlüssel: 64 Hex-Zeichen (256 Bit). */
export const ClientKey = z.string().regex(/^[0-9a-f]{64}$/);

export const AuthRequest = z.object({ username: Username, key: ClientKey });
export type AuthRequest = z.infer<typeof AuthRequest>;

export const ChangePasswordRequest = z.object({ oldKey: ClientKey, newKey: ClientKey });
