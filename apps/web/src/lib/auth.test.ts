import { describe, expect, it } from 'vitest';
import { deriveClientKey } from './auth';

describe('Passwort-Ableitung', () => {
  it('Client-Schlüssel hängt von Name (ohne Groß/klein) und Passwort ab', async () => {
    const a = await deriveClientKey('Eric', 'geheim123', 1000);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await deriveClientKey('eric', 'geheim123', 1000)).toBe(a);
    expect(await deriveClientKey('eric2', 'geheim123', 1000)).not.toBe(a);
    expect(await deriveClientKey('eric', 'geheim124', 1000)).not.toBe(a);
  });
});
