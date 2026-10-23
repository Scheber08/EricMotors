import type { Dictionary } from './index';

/** Führt Wörterbücher tief zusammen (spätere überschreiben frühere nur auf Blattebene). */
export function mergeDictionaries(...parts: Dictionary[]): Dictionary {
  const out: Dictionary = {};
  for (const part of parts) {
    for (const [key, value] of Object.entries(part)) {
      const existing = out[key];
      out[key] =
        typeof value === 'object' && typeof existing === 'object'
          ? mergeDictionaries(existing, value)
          : value;
    }
  }
  return out;
}
