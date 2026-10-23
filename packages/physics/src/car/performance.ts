import type { Car } from '@ericmotors/schema';
import { FUELS, G, RHO_AIR } from '../constants';
import type { EngineAnalysis } from '../engine/analyze';
import { type EngineCurve, partLoadEfficiency } from '../engine/curve';
import type { AeroProperties } from './aero';
import type { CarGeometry } from './geometry';
import type { MassProperties } from './mass';
import type { TireProperties } from './tires';

/**
 * Fahrleistungen aus Fahrwiderstandsgleichung und einfacher Längsdynamik
 * (docs/MODELS.md § Fahrleistungen):
 *
 *   F_Rad = M_Motor · i_G · i_A · η / r
 *   F_W   = ½ · ρ · c_w · A · v² + f_R(v) · (m · g + F_Abtrieb)
 *   m_red = m · (1,04 + 0,0015 · (i_G · i_A)²)      Drehmassenzuschlag, Form nach Wong (2008), Kap. 3.2;
 *                                                  Koeffizient für moderne, leichtere Antriebsstränge reduziert
 */

export interface PerformanceContext {
  car: Car;
  geometry: CarGeometry;
  mass: MassProperties;
  aero: AeroProperties;
  tires: TireProperties;
  engine: EngineAnalysis;
}

export interface TractionPoint {
  /** Geschwindigkeit, m/s. */
  speed: number;
  /** Zugkraft am Rad, N. */
  force: number;
}

export interface Performance {
  /** Masse inkl. Fahrer (75 kg), kg. */
  testMass: number;
  drivetrainEfficiency: number;
  /** Höchstgeschwindigkeit, m/s, und ob Luftwiderstand oder Drehzahlbegrenzer limitiert. */
  topSpeed: number;
  topSpeedLimitedBy: 'drag' | 'rev-limit';
  /** Beschleunigungszeiten, s (null, wenn nicht erreicht). */
  accel0to100: number | null;
  accel80to120: number | null;
  quarterMile: number | null;
  /** Bremsweg 100–0 km/h, m. */
  braking100to0: number;
  /** Stationäre Querbeschleunigung bei 80 km/h, m/s². */
  lateralAcceleration: number;
  /** Eigenlenktendenz: > 0 Untersteuern, < 0 Übersteuern (dimensionslos, ±0,3). */
  balance: number;
  /** Kraftstoffverbrauch im Mischzyklus, m³/m (× 1e8 = l/100 km). */
  fuelPerDistance: number;
  /** CO₂-Ausstoß, kg/m (× 1e6 = g/km). */
  co2PerDistance: number;
  /** Reichweite, m. */
  range: number;
  /** Zugkraft je Gang und Fahrwiderstand über der Geschwindigkeit (für Diagramme). */
  traction: TractionPoint[][];
  resistance: TractionPoint[];
}

const KMH = 1 / 3.6;
const rpm = (n: number) => (n * Math.PI) / 30;

/** Lineare Interpolation des Volllastmoments; oberhalb des Begrenzers 0. */
export function torqueAt(curve: EngineCurve, speed: number): number {
  const pts = curve.points;
  if (speed <= pts[0]!.speed) return pts[0]!.torque;
  if (speed > pts.at(-1)!.speed + 1e-9) return 0;
  let lo = 0;
  let hi = pts.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (pts[mid]!.speed <= speed) lo = mid;
    else hi = mid;
  }
  const a = pts[lo]!;
  const b = pts[hi]!;
  return a.torque + ((b.torque - a.torque) * (speed - a.speed)) / (b.speed - a.speed);
}

export function drivetrainEfficiency(car: Car): number {
  const dt = car.drivetrain;
  const box = { manual: 0.95, sequential: 0.95, dct: 0.94, automatic: 0.9, cvt: 0.86 }[dt.gearbox];
  return box * (dt.layout === 'awd' ? 0.95 : 1) * (1 + 0.003 * dt.quality);
}

export function computePerformance(ctx: PerformanceContext): Performance {
  const { car, geometry: g, mass, aero, tires, engine } = ctx;
  const dt = car.drivetrain;
  const curve = engine.curve;
  const revLimit = car.engine.variant.revLimit;
  const m = mass.total + 75;
  const eta = drivetrainEfficiency(car);
  const fd = dt.finalDrive;
  const driven = dt.layout === 'fwd' ? tires.front : tires.rear;
  const r = driven.radius;
  const cdA = aero.dragCoefficient * aero.frontalArea;
  const clA = (aero.liftFront + aero.liftRear) * aero.frontalArea;
  const crr = (tires.front.rollingResistance + tires.rear.rollingResistance) / 2;
  const isCvt = dt.gearbox === 'cvt';

  const downforce = (v: number) => -0.5 * RHO_AIR * clA * v * v;
  // Rollwiderstand steigt mit der Geschwindigkeit: f_R = f₀ · (1 + V / 160 km/h) (Wong 2008, Gl. 1.1).
  const resistance = (v: number) =>
    0.5 * RHO_AIR * cdA * v * v + crr * (1 + (v * 3.6) / 160) * Math.max(0, m * G + downforce(v));

  /** Verfügbare Gesamtübersetzungen (CVT: stufenlos zwischen größter und kleinster). */
  const cvtRatio = (v: number) => {
    const target = curve.peakPower.speed / Math.max(v / r, 1e-3);
    return Math.min(dt.ratios[0]!, Math.max(dt.ratios.at(-1)!, target / fd)) * fd;
  };
  const gearRatios = isCvt ? [] : dt.ratios.map((i) => i * fd);
  const wheelForce = (ratio: number, v: number) => {
    const omega = (v / r) * ratio;
    if (omega > revLimit + 1e-6) return 0;
    return (torqueAt(curve, omega) * ratio * eta) / r;
  };

  // ---------- Zugkraftdiagramm und Höchstgeschwindigkeit ----------
  const vMax = 120;
  const traction: TractionPoint[][] = [];
  const resistanceCurve: TractionPoint[] = [];
  for (let v = 0; v <= vMax; v += 1) resistanceCurve.push({ speed: v, force: resistance(v) });

  const ratiosForTraction = isCvt ? [null] : gearRatios;
  let topSpeed = 0;
  let topSpeedLimitedBy: Performance['topSpeedLimitedBy'] = 'drag';
  for (const ratio of ratiosForTraction) {
    const points: TractionPoint[] = [];
    const vLimit = ratio === null ? vMax : Math.min(vMax, (revLimit / ratio) * r);
    const vIdle = ratio === null ? 0 : (curve.points[0]!.speed / ratio) * r;
    for (let v = vIdle; v <= vLimit + 1e-9; v += Math.max(0.25, (vLimit - vIdle) / 80)) {
      points.push({ speed: v, force: wheelForce(ratio ?? cvtRatio(v), v) });
    }
    traction.push(points);
    // Höchstgeschwindigkeit in diesem Gang: größtes v mit Zugkraft ≥ Widerstand.
    for (let v = vLimit; v > vIdle; v -= 0.05) {
      if (wheelForce(ratio ?? cvtRatio(v), v) >= resistance(v)) {
        if (v > topSpeed) {
          topSpeed = v;
          topSpeedLimitedBy = ratio !== null && vLimit - v < 0.1 ? 'rev-limit' : 'drag';
        }
        break;
      }
    }
  }

  // ---------- Beschleunigung ----------
  const wf = mass.frontWeightShare;
  const h = mass.cgZ;
  const L = g.wheelbase;
  const assisted = car.trim.assists.launchControl || car.trim.assists.tcs;
  const utilization = car.trim.assists.launchControl ? 0.98 : assisted ? 0.95 : 0.88;
  const shiftTime = { manual: 0.35, automatic: 0.25, dct: 0.06, sequential: 0.1, cvt: 0 }[
    dt.gearbox
  ];
  const launchSpeed = Math.min(
    0.8 * revLimit,
    Math.max(rpm(2500), curve.peakTorque.speed * (car.trim.assists.launchControl ? 0.9 : 0.7)),
  );
  const converter = dt.gearbox === 'automatic';

  const tractionLimit = (a: number) => {
    const nf = Math.max(0, m * G * wf - (m * a * h) / L);
    const nr = Math.max(0, m * G * (1 - wf) + (m * a * h) / L);
    const limit =
      dt.layout === 'fwd'
        ? tires.front.grip * nf
        : dt.layout === 'rwd'
          ? tires.rear.grip * nr
          : tires.front.grip * nf + tires.rear.grip * nr;
    return limit * utilization;
  };

  let v = 0;
  let x = 0;
  let t = 0;
  let a = 0;
  let gear = 0;
  let shiftTimer = 0;
  let accel0to100: number | null = null;
  let t80: number | null = null;
  let accel80to120: number | null = null;
  let quarterMile: number | null = null;
  const step = 0.005;
  while (t < 60 && (accel0to100 === null || accel80to120 === null || quarterMile === null)) {
    const ratio = isCvt ? cvtRatio(v) : gearRatios[gear]!;
    let force = 0;
    const shifting = shiftTimer > 0;
    if (shifting) {
      shiftTimer -= step;
    } else {
      const omegaWheel = v / r;
      let omega = omegaWheel * ratio;
      let multiplier = 1;
      if (omega < launchSpeed && (gear === 0 || isCvt)) {
        // Anfahren mit schleifender Kupplung bzw. Wandler (Momentüberhöhung bis 1,9).
        if (converter) multiplier = 1 + 0.9 * (1 - omega / launchSpeed);
        omega = launchSpeed;
      }
      force = (torqueAt(curve, omega) * multiplier * ratio * eta) / r;
      if (!isCvt && gear < gearRatios.length - 1) {
        const nextRatio = gearRatios[gear + 1]!;
        const nextForce = wheelForce(nextRatio, v);
        if (
          omega >= 0.995 * revLimit ||
          (nextForce >= force && omegaWheel * nextRatio > launchSpeed * 0.9)
        ) {
          gear += 1;
          shiftTimer = shiftTime;
        }
      }
    }
    // Motorbegrenzt: Drehmassen von Motor und Getriebe werden mitbeschleunigt (δ).
    // Traktionsbegrenzt: Das überschüssige Moment geht in Schlupf, die Reifen beschleunigen
    // nur Fahrzeug und Räder (δ ≈ 1,04).
    const delta = 1.04 + 0.0015 * ratio * ratio;
    const res = resistance(v);
    a = Math.min((force - res) / (m * delta), (tractionLimit(a) - res) / (m * 1.04));
    if (a <= 0 && !shifting && v > 1) break; // Höchstgeschwindigkeit erreicht
    v += a * step;
    x += v * step;
    t += step;
    if (accel0to100 === null && v >= 100 * KMH) accel0to100 = t;
    if (t80 === null && v >= 80 * KMH) t80 = t;
    if (t80 !== null && accel80to120 === null && v >= 120 * KMH) accel80to120 = t - t80;
    if (quarterMile === null && x >= 402.336) quarterMile = t;
  }

  // ---------- Bremsen ----------
  const muAvg = (tires.front.grip + tires.rear.grip) / 2;
  const optimalBias = Math.min(0.9, wf + (muAvg * h) / L);
  const biasPenalty = Math.abs(car.brakes.bias - optimalBias) * (car.trim.assists.abs ? 0.5 : 1);
  // Längs-Haftbeiwert beim Bremsen liegt etwa 8 % über dem Querwert (Reifenkennfeld-Spitze).
  const brakeEfficiency =
    1.08 * (car.trim.assists.abs ? 0.95 : 0.82) * Math.max(0.5, 1 - biasPenalty);
  const capacity = brakeCapacity(car);
  let braking100to0 = 0;
  for (let vb = 100 * KMH; vb > 0; vb -= 0.1) {
    const grip =
      (muAvg * (m * G + downforce(vb)) * brakeEfficiency + 0.5 * RHO_AIR * cdA * vb * vb) / m;
    const decel = Math.min(grip, capacity / m);
    braking100to0 += (vb * 0.1) / decel;
  }

  // ---------- Querdynamik ----------
  const vLat = 80 * KMH;
  const s = car.suspension;
  const stiffness = (s.front.springStiffness + s.rear.springStiffness) / 2;
  const arb = (s.front.antiRollBar + s.rear.antiRollBar) / 2;
  const camber = (s.front.camber + s.rear.camber) / 2;
  const track = (g.trackFront + g.trackRear) / 2;
  const balance =
    0.5 * (wf - 0.5) +
    0.15 * (s.front.antiRollBar - s.rear.antiRollBar) +
    0.1 * (s.front.springStiffness - s.rear.springStiffness) -
    (0.5 * (tires.front.grip - tires.rear.grip)) / muAvg +
    (dt.layout === 'fwd' ? 0.03 : dt.layout === 'rwd' ? -0.02 : 0);
  const factors =
    Math.pow(1400 / m, 0.05) *
    (0.92 +
      0.06 * stiffness +
      0.02 * arb +
      { 'twin-tube': 0, 'mono-tube': 0.01, adaptive: 0.02 }[s.dampers] +
      (s.antiRoll === 'active' ? 0.03 : 0)) *
    (1 - 1.5 * Math.abs(camber + 0.026)) *
    (1 - 0.4 * Math.max(0, h / track - 0.35)) *
    (1 - 0.25 * Math.abs(balance - 0.03)) *
    (1 + 0.005 * s.quality);
  const lateralAcceleration = (muAvg * (m * G + downforce(vLat)) * factors) / m;

  // ---------- Verbrauch (Mischzyklus) ----------
  const fuel = FUELS[car.engine.variant.fuel];
  const engineInput = { family: car.engine.family, variant: car.engine.variant };
  const minCruise = car.engine.variant.fuel === 'diesel' ? rpm(1200) : rpm(1300);
  const accessory =
    600 +
    { none: 0, radio: 20, infotainment: 60, 'premium-infotainment': 150 }[car.trim.entertainment];
  const steadyFuel = (speed: number) => {
    const power = (resistance(speed) * speed) / eta + accessory;
    // Höchster Gang, in dem die Drehzahl reicht und genug Reserve bleibt.
    const options = isCvt ? [cvtRatio(speed)] : [...gearRatios].reverse();
    let omega = (speed / r) * options[options.length - 1]!;
    for (const ratio of options) {
      const o = (speed / r) * ratio;
      if (o >= minCruise && torqueAt(curve, o) * o * 0.8 >= power && o <= revLimit) {
        omega = o;
        break;
      }
    }
    if (isCvt) omega = Math.max(minCruise, Math.min(omega, rpm(2500)));
    const efficiency = Math.max(0.05, partLoadEfficiency(engineInput, omega, power));
    return power / (efficiency * fuel.lhv * speed); // kg/m
  };
  const urbanSpeed = 50 * KMH;
  const stopsPerMeter = 1.2 / 1000;
  const accelEfficiency = Math.max(
    0.1,
    partLoadEfficiency(engineInput, rpm(2500), Math.min(30e3, 0.5 * curve.peakPower.power)),
  );
  const accelFuel =
    (stopsPerMeter * 0.5 * m * 1.1 * urbanSpeed * urbanSpeed) / (accelEfficiency * eta * fuel.lhv);
  const vd = engine.displacement * 1000;
  const idleFuel = (7.8e-5 * vd * 0.15 * 72) / 1000; // kg/m: 15 % Standzeit bei 72 s/km
  const urban = steadyFuel(urbanSpeed) + accelFuel + idleFuel;
  // Instationärzuschlag 1,1 für Beschleunigungen außerhalb der Stadt, Kaltstart und Fahrprofil
  // (spielnahe Angleichung an WLTP-Werte).
  const kgPerMeter =
    1.1 * (0.35 * urban + 0.4 * steadyFuel(90 * KMH) + 0.25 * steadyFuel(120 * KMH));
  const fuelPerDistance = kgPerMeter / fuel.density;

  return {
    testMass: m,
    drivetrainEfficiency: eta,
    topSpeed,
    topSpeedLimitedBy,
    accel0to100,
    accel80to120,
    quarterMile,
    braking100to0,
    lateralAcceleration,
    balance,
    fuelPerDistance,
    co2PerDistance: kgPerMeter * fuel.co2PerKg,
    range: g.tankVolume / fuelPerDistance,
    traction,
    resistance: resistanceCurve,
  };
}

/**
 * Maximale Bremskraft aller vier Räder, N. Spielnahe Kapazität je Rad
 *   F = 9000 N · (D / 0,3 m)² · Kolbenfaktor · Belag · Bauart.
 */
export function brakeCapacity(car: Car): number {
  const b = car.brakes;
  const pad = { organic: 0.85, 'semi-metallic': 1, ceramic: 1.05, race: 1.2 }[b.pads];
  const axle = (a: Car['brakes']['front']) =>
    2 *
    9000 *
    Math.pow(a.diameter / 0.3, 2) *
    (1 + 0.15 * (a.pistons - 1)) *
    pad *
    { drum: 0.6, 'solid-disc': 0.85, 'vented-disc': 1, 'carbon-ceramic': 1.1 }[a.type];
  return (axle(b.front) + axle(b.rear)) * (1 + 0.01 * b.quality);
}
