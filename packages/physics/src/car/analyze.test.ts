import { describe, expect, it } from 'vitest';
import { CAR_TEMPLATES, type Car, type CarTemplateId } from '@ericmotors/schema';
import { analyzeCar } from './analyze';
import { toSimulationInput } from '../simulation';

const KMH = 1 / 3.6;
const analyze = (id: CarTemplateId, patch?: (c: Car) => void) => {
  const car = CAR_TEMPLATES[id]();
  patch?.(car);
  return analyzeCar(car);
};

/**
 * Referenzen realer Fahrzeuge, an die die Vorlagen angelehnt sind (Herstellerangaben).
 * Das spielnahe Modell soll innerhalb der angegebenen Toleranz liegen.
 */
const REFERENCES: Record<
  CarTemplateId,
  { mass: number; accel: number; vmax: number; fuel: number }
> = {
  'light-roadster': { mass: 1100, accel: 6.5, vmax: 219, fuel: 6.9 },
  'muscle-car': { mass: 1750, accel: 4.6, vmax: 260, fuel: 12.5 },
  'hot-hatch': { mass: 1400, accel: 6.2, vmax: 250, fuel: 7.5 },
  'diesel-wagon': { mass: 1550, accel: 8.9, vmax: 215, fuel: 5.5 },
};

describe('Auto: Referenzfahrzeuge', () => {
  for (const [id, ref] of Object.entries(REFERENCES) as [
    CarTemplateId,
    (typeof REFERENCES)[CarTemplateId],
  ][]) {
    it(`${id}: Masse ±15 %, 0–100 ±35 %, Vmax ±15 %, Verbrauch ±25 %`, () => {
      const a = analyze(id);
      const p = a.performance;
      expect(a.mass.total / ref.mass).toBeGreaterThan(0.85);
      expect(a.mass.total / ref.mass).toBeLessThan(1.15);
      expect(p.accel0to100! / ref.accel).toBeGreaterThan(0.65);
      expect(p.accel0to100! / ref.accel).toBeLessThan(1.35);
      expect(p.topSpeed / KMH / ref.vmax).toBeGreaterThan(0.85);
      expect(p.topSpeed / KMH / ref.vmax).toBeLessThan(1.15);
      expect((p.fuelPerDistance * 1e8) / ref.fuel).toBeGreaterThan(0.75);
      expect((p.fuelPerDistance * 1e8) / ref.fuel).toBeLessThan(1.25);
    });
  }

  it('Vorlagen haben keine Fehler-Warnungen', () => {
    for (const id of Object.keys(REFERENCES) as CarTemplateId[]) {
      expect(
        analyze(id).warnings.filter((w) => w.severity === 'error'),
        id,
      ).toEqual([]);
    }
  });

  it('Bremsweg 100–0 im realistischen Bereich (30–45 m)', () => {
    for (const id of Object.keys(REFERENCES) as CarTemplateId[]) {
      const d = analyze(id).performance.braking100to0;
      expect(d).toBeGreaterThan(30);
      expect(d).toBeLessThan(45);
    }
  });

  it('Ratings liegen in 0..100 und ergeben ein stimmiges Profil', () => {
    const roadster = analyze('light-roadster').ratings;
    const wagon = analyze('diesel-wagon').ratings;
    for (const r of [roadster, wagon])
      for (const v of Object.values(r)) expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(100);
    expect(roadster.sportiness).toBeGreaterThan(wagon.sportiness);
    expect(wagon.practicality).toBeGreaterThan(roadster.practicality);
    expect(wagon.utility).toBeGreaterThan(roadster.utility);
  });
});

describe('Auto: Regler wirken in die richtige Richtung', () => {
  it('CFK-Karosserie → leichter, schneller, teurer', () => {
    const base = analyze('hot-hatch');
    const cfrp = analyze('hot-hatch', (c) => {
      c.trim.bodyMaterial = 'cfrp';
      c.model.chassisMaterial = 'cfrp';
    });
    expect(cfrp.mass.total).toBeLessThan(base.mass.total - 100);
    expect(cfrp.performance.accel0to100!).toBeLessThan(base.performance.accel0to100!);
    expect(cfrp.cost.total).toBeGreaterThan(base.cost.total);
  });

  it('Heckflügel → mehr Abtrieb, mehr Luftwiderstand, weniger Vmax', () => {
    const base = analyze('hot-hatch');
    const wing = analyze('hot-hatch', (c) => (c.aero.rearDownforce = 1));
    expect(wing.aero.liftRear).toBeLessThan(base.aero.liftRear);
    expect(wing.performance.topSpeed).toBeLessThan(base.performance.topSpeed);
  });

  it('Allrad verbessert die Beschleunigung eines starken Fronttrieblers', () => {
    const fwd = analyze('hot-hatch');
    const awd = analyze('hot-hatch', (c) => (c.drivetrain.layout = 'awd'));
    expect(awd.performance.accel0to100!).toBeLessThan(fwd.performance.accel0to100!);
  });

  it('weichere Federn → mehr Komfort, weniger Querbeschleunigung', () => {
    const base = analyze('hot-hatch');
    const soft = analyze('hot-hatch', (c) => {
      c.suspension.front.springStiffness = 0.1;
      c.suspension.rear.springStiffness = 0.1;
    });
    expect(soft.ratings.comfort).toBeGreaterThan(base.ratings.comfort);
    expect(soft.performance.lateralAcceleration).toBeLessThan(base.performance.lateralAcceleration);
  });

  it('V8 quer in einem Kleinwagen passt nicht', () => {
    const a = analyze('hot-hatch', (c) => {
      const v8 = CAR_TEMPLATES['muscle-car']().engine;
      c.engine = { ...v8, placement: 'front-transverse' };
      c.model.dimensions.width = 1.6;
    });
    expect(a.warnings.some((w) => w.code === 'car.engineTooLongTransverse')).toBe(true);
  });

  it('zu große Bremsscheibe für die Felge → Fehler', () => {
    const a = analyze('light-roadster', (c) => (c.brakes.front.diameter = 0.4));
    expect(a.warnings.some((w) => w.code === 'car.brakeRimClearance')).toBe(true);
  });
});

describe('SimulationInput', () => {
  it('enthält konsistente, flache Daten', () => {
    const car = CAR_TEMPLATES['muscle-car']();
    const s = toSimulationInput(car);
    expect(s.gearRatios).toEqual(car.drivetrain.ratios);
    expect(s.frontDriveShare).toBe(0);
    expect(s.torqueCurve.length).toBeGreaterThan(10);
    expect(s.mass).toBeGreaterThan(1000);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});
