import { create } from 'zustand';
import type { PowerUnit, UnitSystem } from '@ericmotors/schema';
import { safeStorage } from '../lib/safeStorage';

export type Language = 'de' | 'en';
export type Mode = 'beginner' | 'engineer';
export type Theme = 'system' | 'light' | 'dark';

export interface Settings {
  language: Language;
  units: UnitSystem;
  power: PowerUnit;
  mode: Mode;
  theme: Theme;
}

const KEY = 'schebermotors.settings.v1';

function initial(): Settings {
  const browserLanguage: Language =
    typeof navigator !== 'undefined' && navigator.language.startsWith('de') ? 'de' : 'en';
  const defaults: Settings = {
    language: browserLanguage,
    units: 'metric',
    power: browserLanguage === 'de' ? 'PS' : 'hp',
    mode: 'beginner',
    theme: 'system',
  };
  try {
    const raw = safeStorage.get(KEY);
    return raw ? { ...defaults, ...(JSON.parse(raw) as Partial<Settings>) } : defaults;
  } catch {
    return defaults;
  }
}

interface SettingsStore extends Settings {
  set: (patch: Partial<Settings>) => void;
}

export const useSettings = create<SettingsStore>((set, get) => ({
  ...initial(),
  set: (patch) => {
    set(patch);
    const { language, units, power, mode, theme } = get();
    safeStorage.set(
      KEY,
      JSON.stringify({ language, units, power, mode, theme } satisfies Settings),
    );
  },
}));
