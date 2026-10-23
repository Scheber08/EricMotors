/**
 * localStorage nur für Komfort-Einstellungen pro Browser (Sprache, Einheiten, Theme).
 * Zugriffe können in privaten Fenstern oder bei blockierten Seitendaten fehlschlagen.
 */
export const safeStorage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // ignorieren: Einstellungen gelten dann nur für diese Sitzung
    }
  },
};
