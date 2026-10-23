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

describe('Zusammenführen der Wörterbücher', () => {
  it('behält Motor- und Auto-Texte im selben Bereich', () => {
    for (const lang of ['de', 'en'] as const) {
      expect(translate(lang, 'designer.addVariant')).not.toBe('designer.addVariant');
      expect(translate(lang, 'designer.views.xray')).not.toBe('designer.views.xray');
      expect(translate(lang, 'params.engine.bore')).not.toBe('params.engine.bore');
      expect(translate(lang, 'params.car.wheelbase')).not.toBe('params.car.wheelbase');
      expect(translate(lang, 'common.saved')).not.toBe('common.saved');
    }
  });
});
