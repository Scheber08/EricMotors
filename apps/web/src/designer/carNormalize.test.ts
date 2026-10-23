import { describe, expect, it } from 'vitest';
import { CAR_TEMPLATES, Car } from '@ericmotors/schema';
import { normalizeCar, setGearCount, spreadRatios } from './carNormalize';

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
