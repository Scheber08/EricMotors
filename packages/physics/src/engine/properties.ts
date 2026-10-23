import type { EngineFamily, EngineVariant } from '@ericmotors/schema';
import { P_AMBIENT } from '../constants';
import {
  type EngineCurve,
  type EngineInput,
  displacement,
  meanPistonSpeed,
  partLoadEfficiency,
} from './curve';

/**
 * Abgeleitete Motoreigenschaften: Masse, Abmessungen, Kosten, Ratings und Warnungen.
 * Spielnahe Kalibrierung, siehe docs/MODELS.md § Motor-Eigenschaften.
 */

const clamp = (x: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, x));
const q = (quality: number) => 1 + 0.07 * quality;

/** Hubraum, für den der Block ausgelegt ist (max. Bohrung und Hub), m³. */
export const familyDisplacement = (f: EngineFamily) =>
  (Math.PI / 4) * f.maxBore * f.maxBore * f.maxStroke * f.cylinders;

const cylindersPerBank = (f: EngineFamily) =>
  f.layout === 'inline' ? f.cylinders : Math.ceil(f.cylinders / 2);

// ---------- Masse ----------

/**
 * Motormasse (trocken, mit Anbauteilen), kg. Empirischer Ansatz
 *   m = 25 + 55 · V_Block^0,7 · Werkstofffaktor · Zylinderfaktor · Ventiltriebfaktor
 * mit V in Litern; kalibriert an Serienmotoren (Alu-2.0-R4 ≈ 125 kg, Alu-5.0-V8 ≈ 210 kg,
 * Grauguss-Blöcke ≈ +20 %).
 */
export function engineMass({ family: f, variant: v }: EngineInput): number {
  const liters = familyDisplacement(f) * 1000;
  const block = {
    'cast-iron': 1.3,
    cgi: 1.2,
    aluminium: 1,
    'aluminium-sleeved': 1.05,
    magnesium: 0.85,
  }[f.blockMaterial];
  const head = { 'cast-iron': 1.4, aluminium: 1 }[f.headMaterial];
  const material = 0.55 * block + 0.15 * head + 0.3;
  const cylinders = 1 + 0.02 * (f.cylinders - 4);
  const valvetrain = { ohv: 0.95, sohc: 1, dohc: 1.05 }[f.headType];
  let mass = 25 + 55 * Math.pow(liters, 0.7) * material * cylinders * valvetrain;

  const perCylinder = f.cylinders / 4;
  mass +=
    { 'cast-iron': 0, 'forged-steel': -0.5, 'billet-steel': -1.5 }[v.crankshaft] * perCylinder;
  mass += { cast: 0, 'heavy-cast': 0.8, forged: -0.4, titanium: -1.6 }[v.conrods] * perCylinder;
  mass +=
    { cast: 0, hypereutectic: -0.2, forged: -0.3, 'low-friction': -0.3 }[v.pistons] * perCylinder;

  const a = v.aspiration;
  if (a.kind === 'turbo') mass += a.count * (8 + 8 * a.size) + 12 * a.intercooler;
  if (a.kind === 'supercharger') mass += 14 + 8 * a.size + 12 * a.intercooler;
  if (v.fuel === 'diesel') mass *= 1.12;
  return mass;
}

// ---------- Abmessungen ----------

export interface EngineDimensions {
  /** Länge in Kurbelwellenrichtung, Breite, Höhe; m. */
  length: number;
  width: number;
  height: number;
}

/**
 * Hüllmaße aus Zylinderabstand (≈ 1,18 · Bohrung + 8 mm Steg) und Bankhöhe
 * (Hub/2 + Pleuel ≈ 1,6 · Hub + Kolbenkompressionshöhe ≈ 0,35 · Bohrung + Zylinderkopf).
 */
export function engineDimensions(f: EngineFamily): EngineDimensions {
  const spacing = 1.18 * f.maxBore + 0.008;
  const length = cylindersPerBank(f) * spacing + 0.18 + (f.layout === 'v' ? 0.02 : 0);
  const head = { ohv: 0.12, sohc: 0.15, dohc: 0.18 }[f.headType];
  const bank = 0.5 * f.maxStroke + 1.6 * f.maxStroke + 0.35 * f.maxBore + 0.05 + head;
  switch (f.layout) {
    case 'inline':
      return { length, width: 0.45 + 0.6 * f.maxBore, height: bank + 0.12 };
    case 'v': {
      const half = f.bankAngle / 2;
      return {
        length,
        width: 2 * bank * Math.sin(half) + 0.3,
        height: bank * Math.cos(half) + 0.3,
      };
    }
    case 'boxer':
      return { length, width: 2 * bank + 0.15, height: 0.45 + f.maxBore };
  }
}

// ---------- Kosten ----------

/** Herstellkosten in € (Material + Fertigung), Qualitätsregler wirken je Abschnitt. */
export function engineCost({ family: f, variant: v }: EngineInput): number {
  const liters = familyDisplacement(f) * 1000;
  const z = f.cylinders;
  const blockMat = {
    'cast-iron': 1,
    cgi: 1.4,
    aluminium: 1.6,
    'aluminium-sleeved': 1.8,
    magnesium: 3.5,
  }[f.blockMaterial];
  const headPerCyl = { ohv: 40, sohc: 60, dohc: 90 }[f.headType] + (f.valvesPerCylinder - 2) * 8;
  const family =
    (200 * Math.pow(liters, 0.7) * blockMat +
      headPerCyl * z * (f.headMaterial === 'aluminium' ? 1.2 : 1)) *
    q(f.quality);

  const crank =
    { 'cast-iron': 100, 'forged-steel': 250, 'billet-steel': 700 }[v.crankshaft] * Math.sqrt(z / 4);
  const rods = { cast: 15, 'heavy-cast': 25, forged: 45, titanium: 180 }[v.conrods] * z;
  const pistons = { cast: 10, hypereutectic: 15, forged: 35, 'low-friction': 30 }[v.pistons] * z;
  const bottom = (crank + rods + pistons) * q(v.bottomEndQuality);

  const banks = f.layout === 'inline' ? 1 : 2;
  const cams = f.headType === 'dohc' ? 2 * banks : banks;
  const top =
    ((v.vvt ? 60 * cams : 0) + (v.vvl ? 100 * banks : 0) + 50 * v.camProfile * cams) *
    q(v.topEndQuality);

  const a = v.aspiration;
  const aspiration =
    (a.kind === 'turbo'
      ? 600 * a.count * (0.8 + 0.4 * a.size) + 250 * a.intercooler
      : a.kind === 'supercharger'
        ? { roots: 700, 'twin-screw': 900, centrifugal: 800 }[a.type] + 250 * a.intercooler
        : 0) * q(v.aspirationQuality);

  const fuel =
    ({
      carburetor: 80,
      'single-point': 150,
      'multi-point': 250,
      direct: 600,
      'diesel-indirect': 500,
      'common-rail': 900,
    }[v.fuelSystem] +
      60 * v.intakeSize) *
    q(v.fuelQuality);

  const exhaust =
    ({ cast: 80, 'short-tubular': 200, 'long-tubular': 300, 'equal-length': 450 }[v.headers] *
      banks +
      { none: 0, 'two-way': 150, 'three-way': 350, 'high-flow': 450 }[v.catalyst] +
      { none: 0, 'straight-through': 60, baffled: 90, 'reverse-flow': 120 }[v.muffler] +
      1500 * v.exhaustDiameter) *
    q(v.exhaustQuality);

  const assembly = 300 + 30 * z;
  return family + bottom + top + aspiration + fuel + exhaust + assembly;
}

// ---------- Ratings ----------

/** Grundlaufruhe nach Massenausgleich 1. und 2. Ordnung (Bauart-Tabelle, spielnah). */
function balanceBase(f: EngineFamily): number {
  const deg = (f.bankAngle * 180) / Math.PI;
  if (f.layout === 'inline') return { 2: 25, 3: 50, 4: 55, 5: 72, 6: 95 }[f.cylinders] ?? 50;
  if (f.layout === 'boxer') return { 2: 45, 4: 75, 6: 95 }[f.cylinders] ?? 70;
  switch (f.cylinders) {
    case 6:
      return Math.abs(deg - 60) < 5 ? 75 : Math.abs(deg - 90) < 5 ? 60 : 55;
    case 8:
      return Math.abs(deg - 90) < 5 ? 85 : 68;
    case 10:
      return Math.abs(deg - 72) < 5 || Math.abs(deg - 90) < 5 ? 82 : 72;
    default:
      return 96;
  }
}

/** Zulässige mittlere Kolbengeschwindigkeit (Pleuel und Kolben), m/s. */
export function allowablePistonSpeed(v: EngineVariant): number {
  const rods = { cast: 19, 'heavy-cast': 21, forged: 24, titanium: 27 }[v.conrods];
  const pistons = { cast: 19, hypereutectic: 21, forged: 25, 'low-friction': 22 }[v.pistons];
  return Math.min(rods, pistons) + 0.3 * v.bottomEndQuality;
}

/** Zulässiger effektiver Mitteldruck (Kurbelwelle, Pleuel, Kolben), Pa. */
export function allowableBmep(v: EngineVariant): number {
  const crank = { 'cast-iron': 16, 'forged-steel': 24, 'billet-steel': 32 }[v.crankshaft];
  const rods = { cast: 15, 'heavy-cast': 19, forged: 26, titanium: 30 }[v.conrods];
  const pistons = { cast: 15, hypereutectic: 17, forged: 27, 'low-friction': 17 }[v.pistons];
  return (Math.min(crank, rods, pistons) + 0.4 * v.bottomEndQuality) * 1e5;
}

export interface EngineRatings {
  smoothness: number;
  reliability: number;
  emissions: number;
  responsiveness: number;
  economy: number;
}

export function engineRatings(input: EngineInput, curve: EngineCurve): EngineRatings {
  const { family: f, variant: v } = input;
  const vd = displacement(f, v);
  const cylinderLiters = (vd * 1000) / f.cylinders;
  const diesel = v.fuel === 'diesel';
  const avgQuality =
    (f.quality +
      v.bottomEndQuality +
      v.topEndQuality +
      v.aspirationQuality +
      v.fuelQuality +
      v.exhaustQuality) /
    6;

  const smoothness = clamp(
    balanceBase(f) -
      12 * Math.max(0, cylinderLiters - 0.5) -
      8 * v.camProfile -
      (v.fuelSystem === 'carburetor' ? 3 : 0) -
      (diesel ? 15 : 0) +
      1.5 * v.bottomEndQuality,
  );

  const pistonLoad = meanPistonSpeed(v.stroke, v.revLimit) / allowablePistonSpeed(v);
  const peakBmep = (curve.peakTorque.torque * 4 * Math.PI) / vd;
  const bmepLoad = peakBmep / allowableBmep(v);
  const boostBar = curve.peakBoost / 1e5;
  const reliability = clamp(
    88 -
      60 * Math.max(0, (pistonLoad - 0.85) / 0.3) -
      60 * Math.max(0, (bmepLoad - 0.85) / 0.3) -
      15 * Math.max(0, -curve.knockMargin) -
      4 * boostBar -
      12 * Math.max(0, 0.4 - v.ignitionTiming) -
      (f.blockMaterial === 'magnesium' ? 8 : 0) +
      2 * avgQuality,
  );

  let emissions: number;
  if (diesel) {
    emissions =
      { none: 15, 'two-way': 55, 'three-way': 40, 'high-flow': 45 }[v.catalyst] +
      (v.fuelSystem === 'common-rail' ? 10 : -10);
    emissions -= 40 * Math.max(0, 1.3 - v.lambda);
  } else {
    emissions = { none: 20, 'two-way': 45, 'three-way': 82, 'high-flow': 68 }[v.catalyst];
    emissions -= {
      carburetor: 15,
      'single-point': 8,
      'multi-point': 0,
      direct: 3,
      'diesel-indirect': 0,
      'common-rail': 0,
    }[v.fuelSystem];
    emissions -= 120 * Math.max(0, 1 - v.lambda);
  }
  emissions = clamp(emissions + 1.5 * v.exhaustQuality);

  const a = v.aspiration;
  const lag =
    a.kind === 'turbo' ? (35 * a.size) / Math.pow(a.count, 0.3) + 4 * (a.boost / P_AMBIENT) : 0;
  const responsiveness = clamp(
    85 -
      25 * v.camProfile -
      lag -
      8 * cylinderLiters +
      (a.kind === 'supercharger' ? 3 : 0) +
      v.topEndQuality,
  );

  // Verbrauch: Wirkungsgrad an einem typischen Fahrpunkt (15 kW bei 2000/min ≈ 100 km/h),
  // große Motoren werden dort durch Reibung und Drosselung bestraft.
  const eta = partLoadEfficiency(input, (2000 * Math.PI) / 30, 15e3);
  const economy = clamp(((eta - 0.18) / (0.38 - 0.18)) * 100);

  return { smoothness, reliability, emissions, responsiveness, economy };
}

// ---------- Warnungen ----------

export type Severity = 'info' | 'warning' | 'error';

export interface Warning {
  /** Übersetzungsschlüssel für Meldung und Lösungsvorschlag in der Oberfläche. */
  code: string;
  severity: Severity;
  /** Pfad des betroffenen Parameters (zum Hervorheben in der Oberfläche). */
  path: string;
  params?: Record<string, number | string>;
}

export function engineWarnings(input: EngineInput, curve: EngineCurve): Warning[] {
  const { family: f, variant: v } = input;
  const out: Warning[] = [];
  const vd = displacement(f, v);

  if (curve.knockMargin < 0) {
    out.push({
      code: 'engine.knock',
      severity: curve.knockMargin < -1 ? 'error' : 'warning',
      path: 'variant.compressionRatio',
      params: { margin: curve.knockMargin },
    });
  }
  const pistonSpeed = meanPistonSpeed(v.stroke, v.revLimit);
  const allowedSpeed = allowablePistonSpeed(v);
  if (pistonSpeed > allowedSpeed) {
    out.push({
      code: 'engine.pistonSpeed',
      severity: pistonSpeed > 1.1 * allowedSpeed ? 'error' : 'warning',
      path: 'variant.revLimit',
      params: { value: pistonSpeed, limit: allowedSpeed },
    });
  }
  const peakBmep = (curve.peakTorque.torque * 4 * Math.PI) / vd;
  const allowedBmep = allowableBmep(v);
  if (peakBmep > allowedBmep) {
    out.push({
      code: 'engine.bmep',
      severity: peakBmep > 1.1 * allowedBmep ? 'error' : 'warning',
      path: 'variant.conrods',
      params: { value: peakBmep, limit: allowedBmep },
    });
  }
  const ratio = v.stroke / v.bore;
  if (ratio < 0.6 || ratio > 1.4) {
    out.push({
      code: 'engine.boreStroke',
      severity: 'warning',
      path: 'variant.stroke',
      params: { ratio },
    });
  }
  const a = v.aspiration;
  if (a.kind !== 'natural' && a.boost > 0.6e5 && a.intercooler === 0) {
    out.push({
      code: 'engine.noIntercooler',
      severity: 'warning',
      path: 'variant.aspiration.intercooler',
    });
  }
  if (v.revLimit < 0.97 * curve.peakPower.speed) {
    out.push({ code: 'engine.revLimitLow', severity: 'info', path: 'variant.revLimit' });
  }
  if (v.fuel === 'diesel' && v.revLimit > (5_500 * Math.PI) / 30) {
    out.push({ code: 'engine.dieselRevs', severity: 'warning', path: 'variant.revLimit' });
  }
  if (v.fuel === 'diesel' && v.compressionRatio < 14) {
    out.push({
      code: 'engine.dieselCompression',
      severity: 'error',
      path: 'variant.compressionRatio',
    });
  }
  return out;
}
