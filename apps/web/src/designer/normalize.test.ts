import { describe, expect, it } from 'vitest';
import { ENGINE_TEMPLATES, Engine } from '@ericmotors/schema';
import { normalizeEngine } from './normalize';

describe('Motor-Normalisierung', () => {
  it('Wechsel auf V wählt gültige Zylinderzahl und 90° Bankwinkel', () => {
    const e = ENGINE_TEMPLATES['i4-16-na']();
    e.family.layout = 'v';
    normalizeEngine(e, 'family.layout');
    expect(e.family.cylinders).toBe(6);
    expect(e.family.bankAngle).toBeCloseTo(Math.PI / 2);
    expect(Engine.safeParse(e).success).toBe(true);
  });

  it('Diesel setzt Diesel-Einspritzung und zurück', () => {
    const e = ENGINE_TEMPLATES['i4-16-na']();
    e.variants[0]!.fuel = 'diesel';
    normalizeEngine(e, 'variants.0.fuel');
    expect(e.variants[0]!.fuelSystem).toBe('common-rail');
    expect(Engine.safeParse(e).success).toBe(true);
    e.variants[0]!.fuelSystem = 'direct';
    normalizeEngine(e, 'variants.0.fuelSystem');
    expect(e.variants[0]!.fuel).toBe('premium');
    expect(Engine.safeParse(e).success).toBe(true);
  });

  it('kleinerer Block begrenzt Bohrung und Hub aller Varianten', () => {
    const e = ENGINE_TEMPLATES['v8-50-na']();
    e.family.maxBore = 0.08;
    normalizeEngine(e, 'family.maxBore');
    expect(e.variants[0]!.bore).toBe(0.08);
    expect(Engine.safeParse(e).success).toBe(true);
  });
});
