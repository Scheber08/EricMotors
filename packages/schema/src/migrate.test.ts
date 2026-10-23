import { describe, expect, it } from 'vitest';
import { SchemaVersionError, migrateVehicle } from './migrate';
import { Vehicle } from './vehicle';
import { baseVehicle } from './templates';

describe('migrateVehicle', () => {
  it('lehnt neuere und ungültige Versionen ab', () => {
    expect(() => migrateVehicle({ ...baseVehicle(), schemaVersion: 999 })).toThrow(
      SchemaVersionError,
    );
    expect(() => migrateVehicle({ schemaVersion: 'x' })).toThrow(SchemaVersionError);
    expect(() => migrateVehicle(null)).toThrow(SchemaVersionError);
  });

  it('erkennt unbekannte Bauteile im Antriebsgraph', () => {
    const v = baseVehicle();
    v.powertrain.connections.push({ from: 'engine', to: 'ghost', medium: 'mechanical' });
    const r = Vehicle.safeParse(v);
    expect(r.success).toBe(false);
  });

  it('erkennt Radstand + Überhang > Länge', () => {
    const v = baseVehicle();
    v.body.dimensions.wheelbase = 4;
    expect(Vehicle.safeParse(v).success).toBe(false);
  });
});
