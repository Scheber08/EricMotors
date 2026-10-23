import { describe, expect, it } from 'vitest';
import { Car } from './car';
import { Engine } from './engine';
import { SchemaVersionError, migrateCar, migrateEngine } from './migrate';
import { CAR_TEMPLATES, ENGINE_TEMPLATES, baseCar } from './templates';

const issues = (r: { success: boolean; error?: { issues: unknown } }) =>
  r.success ? '' : JSON.stringify(r.error?.issues, null, 2);

describe('Motor-Vorlagen', () => {
  for (const [id, build] of Object.entries(ENGINE_TEMPLATES)) {
    it(`${id} ist schemakonform und übersteht JSON-Rundreise`, () => {
      const e = build();
      expect(issues(Engine.safeParse(e))).toBe('');
      expect(migrateEngine(JSON.parse(JSON.stringify(e)))).toEqual(e);
    });
  }

  it('lehnt unmögliche Zylinderzahl und zu große Bohrung ab', () => {
    const e = ENGINE_TEMPLATES['i4-16-na']();
    e.family.cylinders = 8;
    expect(Engine.safeParse(e).success).toBe(false);
    const f = ENGINE_TEMPLATES['i4-16-na']();
    f.variants[0]!.bore = 0.09;
    expect(Engine.safeParse(f).success).toBe(false);
  });

  it('verlangt Diesel-Einspritzung für Diesel', () => {
    const e = ENGINE_TEMPLATES['i4-20-diesel']();
    e.variants[0]!.fuelSystem = 'multi-point';
    expect(Engine.safeParse(e).success).toBe(false);
  });
});

describe('Auto-Vorlagen', () => {
  it('Grundauto ist schemakonform', () => {
    expect(issues(Car.safeParse(baseCar()))).toBe('');
  });

  for (const [id, build] of Object.entries(CAR_TEMPLATES)) {
    it(`${id} ist schemakonform und übersteht JSON-Rundreise`, () => {
      const c = build();
      expect(issues(Car.safeParse(c))).toBe('');
      expect(migrateCar(JSON.parse(JSON.stringify(c)))).toEqual(c);
    });
  }

  it('Vorlagen-IDs sind eindeutig', () => {
    const ids = Object.values(CAR_TEMPLATES).map((build) => build().id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('lehnt nicht absteigende Gänge und zu langen Radstand ab', () => {
    const c = baseCar();
    c.drivetrain.ratios = [3, 3.5];
    expect(Car.safeParse(c).success).toBe(false);
    const d = baseCar();
    d.model.dimensions.wheelbase = 3.4;
    expect(Car.safeParse(d).success).toBe(false);
  });
});

describe('Migration', () => {
  it('lehnt neuere und ungültige Versionen ab', () => {
    expect(() => migrateCar({ ...baseCar(), schemaVersion: 999 })).toThrow(SchemaVersionError);
    expect(() => migrateCar({ schemaVersion: 'x' })).toThrow(SchemaVersionError);
    expect(() => migrateEngine(null)).toThrow(SchemaVersionError);
  });
});
