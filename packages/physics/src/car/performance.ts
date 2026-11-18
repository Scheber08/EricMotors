import type { Car } from '@ericmotors/schema';
import { G, RHO_AIR } from '../constants';
import type { EngineAnalysis } from '../engine/analyze';
import type { AeroProperties } from './aero';
import { fadeStops } from './brakes';
import { stiffnessIndex } from './chassis';
import { type Consumption, computeConsumption } from './consumption';
import {
  type DriveUnit,
  centerTransfer,
  driveUnits,
  electricPowerLimit,
  tractionUtilization,
} from './drive';
import type { CarGeometry } from './geometry';
import type { MassProperties } from './mass';
import type { TireProperties } from './tires';

/**
 * Fahrleistungen aus Fahrwiderstandsgleichung und einfacher Längsdynamik
 * (docs/MODELS.md § Fahrleistungen):
 *
 *   F_Rad = Σ_Einheiten M(ω) · i · η / r          (je Achse begrenzt durch μ · N_Achse · Nutzungsgrad)
 *   F_W   = ½ · ρ · c_w · A · v² + f_R(v) · (m · g + F_Abtrieb)
 *   m_red = m · (1,04 + k · i²)                    Drehmassenzuschlag, Form nach Wong (2008), Kap. 3.2
 */

export interface PerformanceContext {
  car: Car;
  geometry: CarGeometry;
  mass: MassProperties;
  aero: AeroProperties;
  tires: TireProperties;
  engine: EngineAnalysis | undefined;
  /** Torsionssteifigkeit, N·m/rad. */
  stiffness: number;
}

export interface TractionPoint {
  /** Geschwindigkeit, m/s. */
  speed: number;
  /** Zugkraft am Rad, N. */
  force: number;
}

export interface TractionCurve {
  unit: DriveUnit['kind'];
  axle: DriveUnit['axle'];
  /** Gangnummer ab 1 (E-Motoren: 1). */
  gear: number;
  points: TractionPoint[];
}

export interface Performance extends Consumption {
  /** Masse inkl. Fahrer (75 kg), kg. */
  testMass: number;
  /** Wirkungsgrad vom Motor zum Rad der wichtigsten Antriebseinheit. */
  drivetrainEfficiency: number;
  /** Höchstgeschwindigkeit, m/s, und ob Luftwiderstand oder Drehzahl limitiert. */
  topSpeed: number;
  topSpeedLimitedBy: 'drag' | 'rev-limit';
  /** Beschleunigungszeiten, s (null, wenn nicht erreicht). */
  accel0to100: number | null;
  accel80to120: number | null;
  quarterMile: number | null;
  /** Bremsweg 100–0 km/h, m. */
  braking100to0: number;
  /** Vollbremsungen aus 100 km/h hintereinander bis zum Fading. */
  fadeStops: number;
  /** Stationäre Querbeschleunigung bei 80 km/h, m/s². */
  lateralAcceleration: number;
  /** Eigenlenktendenz: > 0 Untersteuern, < 0 Übersteuern (dimensionslos, ±0,3). */
  balance: number;
  /** Spitzenleistung des Systems an den Antriebswellen (inkl. Batteriegrenze), W. */
  systemPower: number;
  /** Zugkraft je Antriebseinheit und Gang sowie Fahrwiderstand (für Diagramme). */
  traction: TractionCurve[];
  resistance: TractionPoint[];
}

const KMH = 1 / 3.6;
const V_MAX = 125;

export function computePerformance(ctx: PerformanceContext): Performance {
  const { car, geometry: g, mass, aero, tires, engine } = ctx;
  const units = driveUnits(car, engine);
  const m = mass.total + 75;
  const cdA = aero.dragCoefficient * aero.frontalArea;
  const clA = (aero.liftFront + aero.liftRear) * aero.frontalArea;
  const crr = (tires.front.rollingResistance + tires.rear.rollingResistance) / 2;
  const radius = (u: DriveUnit) => (u.axle === 'front' ? tires.front.radius : tires.rear.radius);
  const eLimit = electricPowerLimit(car);

  const downforce = (v: number) => -0.5 * RHO_AIR * clA * v * v;
  // Rollwiderstand steigt mit der Geschwindigkeit: f_R = f₀ · (1 + V / 160 km/h) (Wong 2008, Gl. 1.1).
  const resistance = (v: number) =>
    0.5 * RHO_AIR * cdA * v * v + crr * (1 + (v * 3.6) / 160) * Math.max(0, m * G + downforce(v));

  const cvtRatio = (u: DriveUnit, v: number) => {
    const target = u.peakPowerSpeed / Math.max(v / radius(u), 1e-3);
    return Math.min(u.ratios[0]!, Math.max(u.ratios[1]!, target));
  };

  /** Zugkraft einer Einheit bei v in gegebener Übersetzung, aufgeteilt in Gesamt- und Elektroanteil. */
  const unitForce = (u: DriveUnit, ratio: number, v: number) => {
    const omega = (v / radius(u)) * ratio;
    if (omega > u.maxSpeed + 1e-6) return { force: 0, electricPower: 0 };
    const k = (ratio * u.efficiency) / radius(u);
    return {
      force: u.torque(omega) * k,
      electricPower: u.electricTorque(omega) * omega,
      electricForce: u.electricTorque(omega) * k,
    };
  };

  /** Beste Zugkraft einer Einheit bei v (bester Gang). */
  const bestForce = (u: DriveUnit, v: number) => {
    const ratios = u.cvt ? [cvtRatio(u, v)] : u.ratios;
    let best = { force: 0, electricPower: 0, electricForce: 0 };
    for (const r of ratios) {
      const f = unitForce(u, r, v);
      if (f.force > best.force) best = { electricForce: 0, ...f };
    }
    return best;
  };

  /** Summe aller Einheiten mit Batteriegrenze (elektrischer Anteil wird bei Bedarf abgeregelt). */
  const totalForce = (
    forces: { force: number; electricPower: number; electricForce?: number }[],
  ) => {
    const pe = forces.reduce((a, f) => a + f.electricPower, 0);
    const scale = pe > eLimit && pe > 0 ? eLimit / pe : 1;
    return forces.reduce((a, f) => a + f.force - (1 - scale) * (f.electricForce ?? 0), 0);
  };

  // ---------- Zugkraftdiagramm, Systemleistung, Höchstgeschwindigkeit ----------
  const resistanceCurve: TractionPoint[] = [];
  for (let v = 0; v <= V_MAX; v += 1) resistanceCurve.push({ speed: v, force: resistance(v) });

  const traction: TractionCurve[] = [];
  for (const u of units) {
    const ratios = u.cvt ? [null] : u.ratios;
    ratios.forEach((ratio, i) => {
      const vLimit = ratio === null ? V_MAX : Math.min(V_MAX, (u.maxSpeed / ratio) * radius(u));
      const vIdle = ratio === null ? 0 : (u.idleSpeed / ratio) * radius(u);
      const points: TractionPoint[] = [];
      for (let v = vIdle; v <= vLimit + 1e-9; v += Math.max(0.25, (vLimit - vIdle) / 80)) {
        points.push({ speed: v, force: unitForce(u, ratio ?? cvtRatio(u, v), v).force });
      }
      traction.push({ unit: u.kind, axle: u.axle, gear: i + 1, points });
    });
  }

  let systemPower = 0;
  for (let v = 2; v <= V_MAX; v += 1)
    systemPower = Math.max(systemPower, totalForce(units.map((u) => bestForce(u, v))) * v);

  let topSpeed = 0;
  let topSpeedLimitedBy: Performance['topSpeedLimitedBy'] = 'drag';
  for (let v = V_MAX; v > 1; v -= 0.05) {
    const f = totalForce(units.map((u) => bestForce(u, v)));
    if (f >= resistance(v)) {
      topSpeed = v;
      const above = totalForce(units.map((u) => bestForce(u, v + 0.3)));
      topSpeedLimitedBy = above < 0.5 * f ? 'rev-limit' : 'drag';
      break;
    }
  }

  // ---------- Beschleunigung ----------
  const wf = mass.frontWeightShare;
  const h = mass.cgZ;
  const L = g.wheelbase;
  const uFront = tractionUtilization(car, 'front');
  const uRear = tractionUtilization(car, 'rear');
  const split = car.drivetrain.awdFrontShare;
  const transfer = centerTransfer(car);

  const state = units.map(() => ({ gear: 0, shiftTimer: 0 }));
  let v = 0;
  let x = 0;
  let t = 0;
  let a = 0;
  let accel0to100: number | null = null;
  let t80: number | null = null;
  let accel80to120: number | null = null;
  let quarterMile: number | null = null;
  const step = 0.005;
  while (t < 60 && (accel0to100 === null || accel80to120 === null || quarterMile === null)) {
    let anyShifting = false;
    const forces = units.map((u, i) => {
      const s = state[i]!;
      const ratio = u.cvt ? cvtRatio(u, v) : u.ratios[s.gear]!;
      if (s.shiftTimer > 0) {
        s.shiftTimer -= step;
        anyShifting = true;
        return { force: 0, electricPower: 0, electricForce: 0, ratio, u };
      }
      const r = radius(u);
      const omegaWheel = v / r;
      let omega = omegaWheel * ratio;
      let multiplier = 1;
      if (u.launchSpeed > 0 && omega < u.launchSpeed && (s.gear === 0 || u.cvt)) {
        // Anfahren mit schleifender Kupplung bzw. Wandler (Momentüberhöhung bis 1,9).
        if (u.converter) multiplier = 1 + 0.9 * (1 - omega / u.launchSpeed);
        omega = u.launchSpeed;
      }
      const k = (ratio * u.efficiency) / r;
      const result = {
        force: u.torque(omega) * multiplier * k,
        electricPower: u.electricTorque(omega) * omega,
        electricForce: u.electricTorque(omega) * k,
        ratio,
        u,
      };
      if (!u.cvt && s.gear < u.ratios.length - 1) {
        const next = unitForce(u, u.ratios[s.gear + 1]!, v).force;
        if (
          omega >= 0.995 * u.maxSpeed ||
          (next >= result.force && omegaWheel * u.ratios[s.gear + 1]! > u.launchSpeed * 0.9)
        ) {
          s.gear += 1;
          s.shiftTimer = u.shiftTime;
        }
      }
      return result;
    });

    // Batteriegrenze, dann Verteilung auf die Achsen und Traktionsgrenzen.
    const pe = forces.reduce((acc, f) => acc + f.electricPower, 0);
    const scale = pe > eLimit && pe > 0 ? eLimit / pe : 1;
    let front = 0;
    let rear = 0;
    let splitFront = 0;
    let splitRear = 0;
    for (const f of forces) {
      const force = f.force - (1 - scale) * f.electricForce;
      if (f.u.axle === 'front') front += force;
      else if (f.u.axle === 'rear') rear += force;
      else {
        splitFront += force * split;
        splitRear += force * (1 - split);
      }
    }
    const nf = Math.max(0, m * G * wf - (m * a * h) / L);
    const nr = Math.max(0, m * G * (1 - wf) + (m * a * h) / L);
    const limitF = tires.front.grip * nf * uFront;
    const limitR = tires.rear.grip * nr * uRear;
    let demandF = front + splitFront;
    let demandR = rear + splitRear;
    // Mitteldifferenzial: Überschuss einer Achse teilweise zur anderen umleiten.
    const overF = Math.min(splitFront, Math.max(0, demandF - limitF)) * transfer;
    const overR = Math.min(splitRear, Math.max(0, demandR - limitR)) * transfer;
    demandF += overR - overF;
    demandR += overF - overR;
    const total = front + rear + splitFront + splitRear;
    const drive = Math.min(demandF, limitF) + Math.min(demandR, limitR);
    const delta =
      1.04 +
      forces.reduce(
        (acc, f) => acc + (total > 0 ? (f.force / total) * f.u.inertia * f.ratio * f.ratio : 0),
        0,
      );
    const res = resistance(v);
    a = Math.min((total - res) / (m * delta), (drive - res) / (m * 1.04));
    if (a <= 0 && !anyShifting && v > 1) break; // Höchstgeschwindigkeit erreicht
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
    braking100to0 += (vb * 0.1) / Math.min(grip, capacity / m);
  }

  // ---------- Querdynamik ----------
  const vLat = 80 * KMH;
  const s = car.suspension;
  const stiffness = (s.front.springStiffness + s.rear.springStiffness) / 2;
  const damping = (s.front.damping + s.rear.damping) / 2;
  const arb = (s.front.antiRollBar + s.rear.antiRollBar) / 2;
  const camber = (s.front.camber + s.rear.camber) / 2;
  const track = (g.trackFront + g.trackRear) / 2;
  const aspect = (car.wheels.front.aspectRatio + car.wheels.rear.aspectRatio) / 2;
  const layout = car.drivetrain.layout;
  const vectoring =
    car.drivetrain.differential === 'active' || car.powertrain.motors.some((mo) => mo.count === 2);
  const balance =
    0.5 * (wf - 0.5) +
    0.15 * (s.front.antiRollBar - s.rear.antiRollBar) +
    0.1 * (s.front.springStiffness - s.rear.springStiffness) -
    (0.5 * (tires.front.grip - tires.rear.grip)) / muAvg +
    (layout === 'fwd' ? 0.03 : layout === 'rwd' ? -0.02 : 0.05 * (split - 0.4));
  const factors =
    Math.pow(1400 / m, 0.05) *
    (0.92 +
      0.06 * stiffness +
      0.02 * arb +
      { 'twin-tube': 0, 'mono-tube': 0.01, adaptive: 0.02 }[s.dampers] +
      (s.antiRoll === 'active' ? 0.03 : 0)) *
    (1 - 0.12 * Math.abs(damping - 0.55)) *
    (1 + 0.04 * (0.5 - aspect)) *
    (0.97 + 0.05 * stiffnessIndex(ctx.stiffness)) *
    (1 - 1.5 * Math.abs(camber + 0.026)) *
    (1 - 0.4 * Math.max(0, h / track - 0.35)) *
    (1 - 0.25 * Math.abs(balance - 0.03)) *
    (vectoring ? 1.02 : 1) *
    (1 + 0.005 * s.quality);
  const lateralAcceleration = (muAvg * (m * G + downforce(vLat)) * factors) / m;

  const main = units[0];
  return {
    testMass: m,
    drivetrainEfficiency: main?.efficiency ?? 1,
    topSpeed,
    topSpeedLimitedBy,
    accel0to100,
    accel80to120,
    quarterMile,
    braking100to0,
    fadeStops: fadeStops(car, m),
    lateralAcceleration,
    balance,
    systemPower,
    traction,
    resistance: resistanceCurve,
    ...computeConsumption({ car, geometry: g, units, engine, testMass: m, resistance, radius }),
  };
}

/**
 * Maximale Bremskraft aller vier Räder, N. Spielnahe Kapazität je Rad
 *   F = 9000 N · (D / 0,3 m)² · Kolbenfaktor · Belag · Bauart.
 */
export function brakeCapacity(car: Car): number {
  const b = car.brakes;
  const pad = { organic: 0.85, 'semi-metallic': 1, ceramic: 1.05, race: 1.2 }[b.pads];
  const axle = (ax: Car['brakes']['front']) =>
    2 *
    9000 *
    Math.pow(ax.diameter / 0.3, 2) *
    (1 + 0.15 * (ax.pistons - 1)) *
    pad *
    { drum: 0.6, 'solid-disc': 0.85, 'vented-disc': 1, 'carbon-ceramic': 1.1 }[ax.type];
  return (axle(b.front) + axle(b.rear)) * (1 + 0.01 * b.quality);
}
