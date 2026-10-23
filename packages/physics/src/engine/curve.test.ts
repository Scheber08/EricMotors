import { describe, expect, it } from 'vitest';
import { ENGINE_TEMPLATES, type EngineTemplateId, type EngineVariant } from '@ericmotors/schema';
import { displacement, engineCurve, partLoadEfficiency } from './curve';

const rpm = (n: number) => (n * Math.PI) / 30;

function curveOf(id: EngineTemplateId, patch: Partial<EngineVariant> = {}) {
  const e = ENGINE_TEMPLATES[id]();
  const variant = { ...e.variants[0]!, ...patch };
  return { family: e.family, variant, curve: engineCurve({ family: e.family, variant }) };
}

const torqueAt = (c: ReturnType<typeof engineCurve>, speed: number) =>
  c.points.reduce((a, b) => (Math.abs(b.speed - speed) < Math.abs(a.speed - speed) ? b : a)).torque;

/**
 * Referenzwerte realer Serienmotoren, an die die Vorlagen angelehnt sind (Herstellerangaben).
 * Das spielnahe Modell soll innerhalb von ±20 % liegen.
 */
const REFERENCES: Record<EngineTemplateId, { power: number; torque: number }> = {
  'i4-16-na': { power: 88e3, torque: 155 },
  'i4-20-na-sport': { power: 135e3, torque: 205 },
  'i4-20-turbo': { power: 180e3, torque: 350 },
  'v8-50-na': { power: 330e3, torque: 530 },
  'i4-20-diesel': { power: 110e3, torque: 340 },
};

describe('Motorkurve: Referenzmotoren', () => {
  for (const [id, ref] of Object.entries(REFERENCES) as [
    EngineTemplateId,
    (typeof REFERENCES)[EngineTemplateId],
  ][]) {
    it(`${id}: Leistung und Drehmoment innerhalb ±20 % der Referenz`, () => {
      const { curve } = curveOf(id);
      expect(curve.peakPower.power / ref.power).toBeGreaterThan(0.8);
      expect(curve.peakPower.power / ref.power).toBeLessThan(1.2);
      expect(curve.peakTorque.torque / ref.torque).toBeGreaterThan(0.8);
      expect(curve.peakTorque.torque / ref.torque).toBeLessThan(1.2);
    });
  }

  it('Leistung = Drehmoment · Winkelgeschwindigkeit an jedem Punkt', () => {
    const { curve } = curveOf('i4-16-na');
    for (const p of curve.points) expect(p.power).toBeCloseTo(p.torque * p.speed, 6);
  });

  it('Kurve reicht vom Leerlauf bis zum Drehzahlbegrenzer', () => {
    const { curve, variant } = curveOf('v8-50-na');
    expect(curve.points[0]!.speed).toBeCloseTo(rpm(800), 6);
    expect(curve.points.at(-1)!.speed).toBeCloseTo(variant.revLimit, 6);
  });

  it('Wirkungsgrad bleibt physikalisch plausibel (< 45 %)', () => {
    for (const id of Object.keys(REFERENCES) as EngineTemplateId[]) {
      const { curve } = curveOf(id);
      for (const p of curve.points) {
        expect(p.efficiency).toBeGreaterThanOrEqual(0);
        expect(p.efficiency).toBeLessThan(0.45);
      }
    }
  });

  it('Hubraum 1.6 l wird korrekt berechnet', () => {
    const e = ENGINE_TEMPLATES['i4-16-na']();
    expect(displacement(e.family, e.variants[0]!) * 1000).toBeCloseTo(1.598, 3);
  });
});

describe('Motorkurve: Regler wirken in die richtige Richtung', () => {
  it('mehr Ladedruck → mehr Drehmoment', () => {
    const base = curveOf('i4-20-turbo').curve.peakTorque.torque;
    const more = curveOf('i4-20-turbo', {
      aspiration: { kind: 'turbo', count: 1, size: 0.4, boost: 1.5e5, intercooler: 0.6 },
      fuel: 'super',
    }).curve.peakTorque.torque;
    expect(more).toBeGreaterThan(base);
  });

  it('größerer Turbo → weniger Drehmoment bei 2000/min (späteres Ansprechen)', () => {
    const small = curveOf('i4-20-turbo').curve;
    const big = curveOf('i4-20-turbo', {
      aspiration: { kind: 'turbo', count: 1, size: 0.9, boost: 1.1e5, intercooler: 0.6 },
    }).curve;
    expect(torqueAt(big, rpm(2000))).toBeLessThan(torqueAt(small, rpm(2000)));
  });

  it('schärfere Nocken → Leistungsmaximum bei höherer Drehzahl', () => {
    const mild = curveOf('i4-16-na', { camProfile: 0.1 }).curve;
    const wild = curveOf('i4-16-na', { camProfile: 0.9, revLimit: rpm(8000) }).curve;
    expect(wild.peakPower.speed).toBeGreaterThan(mild.peakPower.speed);
  });

  it('hohe Verdichtung mit Normalbenzin → Klopfen und Leistungsverlust', () => {
    const ok = curveOf('i4-16-na', { fuel: 'premium' }).curve;
    const knock = curveOf('i4-16-na', { fuel: 'regular', compressionRatio: 13 }).curve;
    expect(knock.knockMargin).toBeLessThan(0);
    expect(ok.knockMargin).toBeGreaterThan(0);
  });

  it('Diesel klopft nicht', () => {
    expect(curveOf('i4-20-diesel').curve.knockMargin).toBe(Infinity);
  });

  it('Teillast: Diesel effizienter als Benziner, beide unter Volllast-Bestwert', () => {
    const p = 15e3;
    const s = rpm(2000);
    const otto = ENGINE_TEMPLATES['i4-16-na']();
    const diesel = ENGINE_TEMPLATES['i4-20-diesel']();
    const etaOtto = partLoadEfficiency({ family: otto.family, variant: otto.variants[0]! }, s, p);
    const etaDiesel = partLoadEfficiency(
      { family: diesel.family, variant: diesel.variants[0]! },
      s,
      p,
    );
    expect(etaDiesel).toBeGreaterThan(etaOtto);
    expect(etaOtto).toBeGreaterThan(0.15);
    expect(etaOtto).toBeLessThan(0.35);
  });
});
