import { describe, expect, it } from 'vitest';
import { CAR_TEMPLATES, Car } from '@ericmotors/schema';
import {
  addMotor,
  freeMotorPositions,
  normalizeCar,
  removeMotor,
  setGearCount,
  setPowertrainType,
  spreadRatios,
} from './carNormalize';

describe('Auto-Normalisierung', () => {
  it('verteilt Übersetzungen geometrisch', () => {
    const r = spreadRatios(3.6, 0.8, 5);
    expect(r[0]).toBe(3.6);
    expect(r[4]).toBeCloseTo(0.8, 3);
    for (let i = 1; i < r.length; i++) expect(r[i]! / r[i - 1]!).toBeCloseTo(r[1]! / r[0]!, 2);
  });

  it('CVT bekommt zwei Eckübersetzungen, zurück auf Automatik acht Gänge', () => {
    const c = CAR_TEMPLATES['hot-hatch']();
    c.drivetrain.gearbox = 'cvt';
    normalizeCar(c, 'drivetrain.gearbox');
    expect(c.drivetrain.ratios).toHaveLength(2);
    expect(Car.safeParse(c).success).toBe(true);
    c.drivetrain.gearbox = 'automatic';
    normalizeCar(c, 'drivetrain.gearbox');
    expect(c.drivetrain.ratios).toHaveLength(8);
    expect(Car.safeParse(c).success).toBe(true);
  });

  it('Gangzahl ändern und ungültige Reihenfolge korrigieren', () => {
    const c = CAR_TEMPLATES['muscle-car']();
    setGearCount(c, 10);
    expect(c.drivetrain.ratios).toHaveLength(10);
    c.drivetrain.ratios[3] = 5;
    normalizeCar(c, 'drivetrain.ratios.3');
    expect(Car.safeParse(c).success).toBe(true);
  });

  it('Roadster hat höchstens zwei Sitze, Radstand passt in die Länge', () => {
    const c = CAR_TEMPLATES['diesel-wagon']();
    c.model.shape = 'roadster';
    c.model.dimensions.length = 3.2;
    normalizeCar(c, 'model.shape');
    expect(c.trim.seats).toBe(2);
    expect(Car.safeParse(c).success).toBe(true);
  });
});

describe('Antriebsart wechseln', () => {
  const types = ['ice', 'electric', 'hybrid'] as const;
  for (const from of types)
    for (const to of types)
      it(`${from} → ${to} bleibt gültig`, () => {
        const c = CAR_TEMPLATES['hot-hatch']();
        setPowertrainType(c, from);
        setPowertrainType(c, to);
        expect(c.powertrain.type).toBe(to);
        expect(Car.safeParse(c).error?.issues ?? []).toEqual([]);
      });

  it('Elektroauto: Motor ergänzen setzt Allrad, entfernen wieder Hinterrad', () => {
    const c = CAR_TEMPLATES['hot-hatch']();
    setPowertrainType(c, 'electric');
    expect(c.drivetrain.layout).toBe('rwd');
    expect(freeMotorPositions(c)).toEqual(['front']);
    addMotor(c, 'front');
    expect(c.drivetrain.layout).toBe('awd');
    removeMotor(c, 1);
    expect(c.drivetrain.layout).toBe('rwd');
    removeMotor(c, 0);
    expect(c.powertrain.motors).toHaveLength(1);
  });

  it('Einbauort tauschen vermeidet doppelte Motoren', () => {
    const c = CAR_TEMPLATES['e-compact']();
    const i = c.powertrain.motors.findIndex((m) => m.position === 'front');
    c.powertrain.motors[i]!.position = 'rear';
    normalizeCar(c, `powertrain.motors.${i}.position`);
    expect(c.powertrain.motors.map((m) => m.position).sort()).toEqual(['front', 'rear']);
    expect(Car.safeParse(c).success).toBe(true);
  });

  it('Plug-in aus → kleine Hybridbatterie', () => {
    const c = CAR_TEMPLATES['plugin-hybrid']();
    c.powertrain.hybrid!.plugIn = false;
    normalizeCar(c, 'powertrain.hybrid.plugIn');
    expect(c.powertrain.battery!.capacity).toBeLessThan(2 * 3.6e6);
  });
});
