import { useCallback } from 'react';
import { useSettings } from '../state/settings';
import { de } from './de';
import { en } from './en';

/**
 * Leichtes Wörterbuch-i18n ohne Bibliothek. Schlüssel sind Pfade wie „garage.title“;
 * Platzhalter {name} werden ersetzt. Fehlt eine Übersetzung, wird Deutsch bzw. der Schlüssel gezeigt.
 */
export type Dictionary = { [key: string]: string | Dictionary };

const dictionaries: Record<'de' | 'en', Dictionary> = { de, en };

function lookup(dict: Dictionary, key: string): string | undefined {
  let node: string | Dictionary | undefined = dict;
  for (const part of key.split('.')) {
    if (typeof node !== 'object') return undefined;
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
}

export function translate(
  language: 'de' | 'en',
  key: string,
  params?: Record<string, string | number>,
): string {
  const text = lookup(dictionaries[language], key) ?? lookup(de, key) ?? key;
  return params
    ? text.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`))
    : text;
}

/** Prüft, ob ein Schlüssel existiert (z. B. für optionale Tooltips). */
export function hasTranslation(language: 'de' | 'en', key: string): boolean {
  return lookup(dictionaries[language], key) !== undefined || lookup(de, key) !== undefined;
}

export function useT() {
  const language = useSettings((s) => s.language);
  return useCallback(
    (key: string, params?: Record<string, string | number>) => translate(language, key, params),
    [language],
  );
}

export function useLocale(): string {
  return useSettings((s) => (s.language === 'de' ? 'de-DE' : 'en-US'));
}
