import { describe, expect, it } from 'vitest';
import { Vehicle } from '../vehicle';
import { migrateVehicle } from '../migrate';
import { TEMPLATES, baseVehicle } from './index';

describe('Vorlagen', () => {
  it('Basisfahrzeug ist schemakonform', () => {
    expect(() => Vehicle.parse(baseVehicle())).not.toThrow();
  });

  for (const t of TEMPLATES) {
    it(`${t.id} ist schemakonform und übersteht JSON-Rundreise + Migration`, () => {
      const v = t.build();
      const result = Vehicle.safeParse(v);
      if (!result.success) throw new Error(JSON.stringify(result.error.issues, null, 2));
      expect(migrateVehicle(JSON.parse(JSON.stringify(v)))).toEqual(v);
    });
  }

  it('Vorlagen-IDs sind eindeutig', () => {
    const ids = TEMPLATES.map((t) => t.build().id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
