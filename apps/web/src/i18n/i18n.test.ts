import { describe, expect, it } from 'vitest';
import { type Dictionary, translate } from './index';
import { de } from './de';
import { en } from './en';

const flatten = (d: Dictionary, prefix = ''): string[] =>
  Object.entries(d).flatMap(([k, v]) =>
    typeof v === 'string' ? [prefix + k] : flatten(v, `${prefix}${k}.`),
  );

describe('i18n', () => {
  it('Deutsch und Englisch haben dieselben Schlüssel', () => {
    expect(flatten(en).sort()).toEqual(flatten(de).sort());
  });

  it('ersetzt Platzhalter und fällt auf den Schlüssel zurück', () => {
    expect(translate('de', 'garage.confirmDelete', { name: 'X' })).toBe('„X“ wirklich löschen?');
    expect(translate('en', 'does.not.exist')).toBe('does.not.exist');
  });
});
