import { describe, expect, it } from 'vitest';
import { ENGINE_TEMPLATES, type EngineTemplateId } from '@ericmotors/schema';
import { analyzeEngine } from './analyze';

const analyze = (id: EngineTemplateId) => {
  const e = ENGINE_TEMPLATES[id]();
  return { engine: e, a: analyzeEngine(e, 'base') };
};

describe('Motor-Eigenschaften', () => {
  it('Massen liegen im Bereich realer Motoren', () => {
    expect(analyze('i4-16-na').a.mass).toBeGreaterThan(90);
    expect(analyze('i4-16-na').a.mass).toBeLessThan(140);
    expect(analyze('v8-50-na').a.mass).toBeGreaterThan(180);
    expect(analyze('v8-50-na').a.mass).toBeLessThan(260);
    expect(analyze('i4-20-diesel').a.mass).toBeGreaterThan(analyze('i4-20-turbo').a.mass);
  });

  it('V8 ist kürzer als lang, Reihenvierer schmaler als V8', () => {
    const v8 = analyze('v8-50-na').a.dimensions;
    const i4 = analyze('i4-16-na').a.dimensions;
    expect(v8.width).toBeGreaterThan(i4.width);
    expect(i4.length).toBeGreaterThan(0.5);
    expect(i4.length).toBeLessThan(0.8);
  });

  it('Kosten: V8 teurer als Reihenvierer, Qualität kostet', () => {
    expect(analyze('v8-50-na').a.cost).toBeGreaterThan(analyze('i4-16-na').a.cost);
    const { engine, a } = analyze('i4-16-na');
    engine.family.quality = 5;
    expect(analyzeEngine(engine, 'base').cost).toBeGreaterThan(a.cost);
  });

  it('Vorlagen sind zuverlässig und ohne Fehler-Warnungen', () => {
    for (const id of Object.keys(ENGINE_TEMPLATES) as EngineTemplateId[]) {
      const { a } = analyze(id);
      expect(
        a.warnings.filter((w) => w.severity === 'error'),
        id,
      ).toEqual([]);
      expect(a.ratings.reliability, id).toBeGreaterThan(60);
    }
  });

  it('Laufruhe: V8 > Reihenvierer, Diesel rauer als Benziner', () => {
    expect(analyze('v8-50-na').a.ratings.smoothness).toBeGreaterThan(
      analyze('i4-16-na').a.ratings.smoothness,
    );
    expect(analyze('i4-20-diesel').a.ratings.smoothness).toBeLessThan(
      analyze('i4-20-turbo').a.ratings.smoothness,
    );
  });

  it('Sparsamkeit: Diesel > 1.6-Sauger > V8', () => {
    const d = analyze('i4-20-diesel').a.ratings.economy;
    const i4 = analyze('i4-16-na').a.ratings.economy;
    const v8 = analyze('v8-50-na').a.ratings.economy;
    expect(d).toBeGreaterThan(i4);
    expect(i4).toBeGreaterThan(v8);
  });

  it('Überdrehen ohne geschmiedete Teile → Warnung und schlechtere Zuverlässigkeit', () => {
    const { engine, a } = analyze('i4-16-na');
    engine.variants[0]!.revLimit = (9_500 * Math.PI) / 30;
    const over = analyzeEngine(engine, 'base');
    expect(over.warnings.some((w) => w.code === 'engine.pistonSpeed')).toBe(true);
    expect(over.ratings.reliability).toBeLessThan(a.ratings.reliability);
  });

  it('ohne Katalysator schlechtere Emissionen', () => {
    const { engine, a } = analyze('i4-16-na');
    engine.variants[0]!.catalyst = 'none';
    expect(analyzeEngine(engine, 'base').ratings.emissions).toBeLessThan(a.ratings.emissions);
  });
});
