import { describe, expect, it } from 'vitest';
import { BodyShape, CAR_TEMPLATES, type Car, baseCar } from '@ericmotors/schema';
import { LOWER_HALF_POINTS, bodyLayout, buildBody, panelSeams } from './bodyGeometry';

function check(car: Car) {
  const mesh = buildBody(car);
  const d = car.model.dimensions;
  const count = mesh.positions.length / 3;
  let finite = true;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = mesh.positions[i + k]!;
      if (!Number.isFinite(v)) finite = false;
      min[k] = Math.min(min[k]!, k === 1 ? -Math.abs(v) : v);
      max[k] = Math.max(max[k]!, k === 1 ? Math.abs(v) : v);
    }
  }
  expect(finite).toBe(true);
  expect(max[0]).toBeLessThanOrEqual(d.overhangFront + 1e-6);
  expect(min[0]).toBeGreaterThanOrEqual(d.overhangFront - d.length - 1e-6);
  expect(max[1]).toBeLessThanOrEqual(d.width / 2 + 0.05);
  expect(min[2]).toBeGreaterThanOrEqual(car.suspension.rideHeight - 1e-6);
  expect(max[2]).toBeLessThanOrEqual(d.height + 0.05);
  for (const idx of Object.values(mesh.groups)) {
    expect(idx.length % 3).toBe(0);
    expect(Math.max(...idx)).toBeLessThan(count);
  }
  return mesh;
}

describe('Karosseriegeometrie', () => {
  for (const [id, build] of Object.entries(CAR_TEMPLATES)) {
    it(`${id}: endliche Punkte innerhalb der Abmessungen, gültige Indizes`, () => {
      const mesh = check(build());
      expect(mesh.groups.paint?.length).toBeGreaterThan(0);
      expect(mesh.groups.headlight?.length).toBeGreaterThan(0);
      expect(mesh.groups.drl?.length).toBeGreaterThan(0);
      expect(mesh.groups.taillight?.length).toBeGreaterThan(0);
      expect(mesh.groups.plate?.length).toBeGreaterThan(0);
    });
  }

  it('alle Grundformen und Extremwerte der Regler erzeugen gültige Geometrie', () => {
    for (const shape of BodyShape.options) {
      for (const v of [0, 1]) {
        const car = baseCar();
        car.model.shape = shape;
        for (const k of Object.keys(car.model.morph) as (keyof Car['model']['morph'])[])
          car.model.morph[k] = v;
        const mesh = check(car);
        expect(mesh.groups.headlight?.length, `${shape} ${v}`).toBeGreaterThan(0);
        expect(mesh.groups.taillight?.length, `${shape} ${v}`).toBeGreaterThan(0);
      }
    }
  });

  it('Roadster ist offen und hat kein Dach, Limousine schon', () => {
    const roadster = CAR_TEMPLATES['light-roadster']();
    expect(bodyLayout(roadster).open).toBe(true);
    expect(buildBody(roadster).groups.roof).toBeUndefined();
    expect(buildBody(CAR_TEMPLATES['diesel-wagon']()).groups.roof?.length).toBeGreaterThan(0);
  });

  it('geschlossene Karosserien haben Seitenfenster mit Säulen', () => {
    for (const shape of ['sedan', 'hatchback', 'wagon', 'suv', 'van', 'coupe'] as const) {
      const car = baseCar();
      car.model.shape = shape;
      const l = bodyLayout(car);
      const mesh = buildBody(car);
      expect(mesh.groups.glass?.length, shape).toBeGreaterThan(0);
      expect(mesh.groups.gloss?.length, shape).toBeGreaterThan(0);
      if (shape !== 'coupe') expect(l.pillars.bX, shape).not.toBeNull();
    }
  });
});

describe('Reaktion auf den Antrieb', () => {
  it('Elektroauto: geschlossener Grill und Leuchtenband, Verbrenner mit vollem Grill', () => {
    const ev = bodyLayout(CAR_TEMPLATES['e-compact']());
    expect(ev.grille).toBe('closed');
    expect(ev.lightBar).toBe(true);
    const ice = bodyLayout(CAR_TEMPLATES['diesel-wagon']());
    expect(ice.grille).toBe('full');
    expect(ice.lightBar).toBe(false);
    expect(bodyLayout(CAR_TEMPLATES['plugin-hybrid']()).grille).toBe('small');
  });

  it('mehr Kühlluftbedarf vergrößert die dunklen Öffnungen der Front', () => {
    const dark = (cooling: number) => {
      const car = CAR_TEMPLATES['muscle-car']();
      car.aero.cooling = cooling;
      return buildBody(car).groups.dark!.length;
    };
    expect(dark(1)).toBeGreaterThan(dark(0));
  });
});

describe('Querschnitte', () => {
  it('Unterboden-Innenkante liegt immer innerhalb der Karosseriebreite', () => {
    const ringSize = 2 * LOWER_HALF_POINTS - 1;
    for (const build of Object.values(CAR_TEMPLATES)) {
      const mesh = buildBody(build(), 60);
      // Punkt 1 ist die Innenkante des Radhauses, Punkt 3 die Außenkante unten.
      for (let r = 0; r <= 60; r++) {
        const inner = mesh.positions[(r * ringSize + 1) * 3 + 1]!;
        const outer = mesh.positions[(r * ringSize + 3) * 3 + 1]!;
        expect(inner).toBeLessThanOrEqual(outer + 1e-9);
      }
    }
  });

  it('Fugen liegen auf der Flanke innerhalb der Abmessungen', () => {
    for (const build of Object.values(CAR_TEMPLATES)) {
      const car = build();
      const l = bodyLayout(car);
      const seams = panelSeams(l);
      expect(seams.length).toBeGreaterThanOrEqual(2);
      for (const s of seams)
        for (const [x, y, z] of s) {
          expect(x).toBeLessThanOrEqual(l.xFront);
          expect(x).toBeGreaterThanOrEqual(l.xRear);
          expect(Math.abs(y)).toBeLessThanOrEqual(l.width / 2 + 0.05);
          expect(z).toBeGreaterThanOrEqual(l.rideHeight);
        }
    }
  });
});
