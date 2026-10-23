import { describe, expect, it } from 'vitest';
import { BodyShape, CAR_TEMPLATES, type Car, baseCar } from '@ericmotors/schema';
import { bodyLayout, buildBody } from './bodyGeometry';

function check(car: Car) {
  const mesh = buildBody(car);
  const d = car.model.dimensions;
  const count = mesh.positions.length / 3;
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const [x, y, z] = [mesh.positions[i]!, mesh.positions[i + 1]!, mesh.positions[i + 2]!];
    expect(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)).toBe(true);
    expect(x).toBeLessThanOrEqual(d.overhangFront + 1e-6);
    expect(x).toBeGreaterThanOrEqual(d.overhangFront - d.length - 1e-6);
    expect(Math.abs(y)).toBeLessThanOrEqual(d.width / 2 + 0.05);
    expect(z).toBeGreaterThanOrEqual(car.suspension.rideHeight - 1e-6);
    expect(z).toBeLessThanOrEqual(d.height + 0.05);
  }
  for (const idx of Object.values(mesh.groups)) {
    expect(idx.length % 3).toBe(0);
    for (const i of idx) expect(i).toBeLessThan(count);
  }
  return mesh;
}

describe('Karosseriegeometrie', () => {
  for (const [id, build] of Object.entries(CAR_TEMPLATES)) {
    it(`${id}: endliche Punkte innerhalb der Abmessungen, gültige Indizes`, () => {
      const mesh = check(build());
      expect(mesh.groups.paint?.length).toBeGreaterThan(0);
    });
  }

  it('alle Grundformen und Extremwerte der Regler erzeugen gültige Geometrie', () => {
    for (const shape of BodyShape.options) {
      for (const v of [0, 1]) {
        const car = baseCar();
        car.model.shape = shape;
        for (const k of Object.keys(car.model.morph) as (keyof Car['model']['morph'])[])
          car.model.morph[k] = v;
        check(car);
      }
    }
  });

  it('Roadster ist offen und hat kein Dach, Limousine schon', () => {
    const roadster = CAR_TEMPLATES['light-roadster']();
    expect(bodyLayout(roadster).open).toBe(true);
    expect(buildBody(roadster).groups.roof).toBeUndefined();
    expect(buildBody(CAR_TEMPLATES['diesel-wagon']()).groups.roof?.length).toBeGreaterThan(0);
  });
});

describe('Querschnitte', () => {
  it('Unterboden-Innenkante liegt immer innerhalb der Karosseriebreite', () => {
    for (const build of Object.values(CAR_TEMPLATES)) {
      const mesh = buildBody(build());
      // Ringe des Unterbaus: 19 Punkte; Punkt 1 ist die Innenkante, Punkt 3 die Außenkante unten.
      for (let r = 0; r < 73; r++) {
        const inner = mesh.positions[(r * 19 + 1) * 3 + 1]!;
        const outer = mesh.positions[(r * 19 + 3) * 3 + 1]!;
        expect(inner).toBeLessThanOrEqual(outer + 1e-9);
      }
    }
  });
});
