import type { Car } from '@ericmotors/schema';
import type { EngineAnalysis } from '../engine/analyze';
import type { EngineCurve } from '../engine/curve';
import { batteryMaxPower, BATTERY_EFFICIENCY } from '../electric/battery';
import { motorEfficiency, motorTorque, unitPeakPower } from '../electric/motor';

/**
 * Antriebseinheiten: jede Quelle von Vortrieb mit eigener Achse, Übersetzungen und Kennlinie.
 *  - Verbrenner (+ ggf. E-Motor am Getriebe beim Parallelhybrid „P2“) über das Schaltgetriebe,
 *    Achse nach Antriebsart; bei Allrad über ein Mitteldifferenzial verteilt („split“).
 *  - E-Motoren an Vorder-/Hinterachse mit fester Untersetzung.
 * Elektrische Leistung aller Einheiten zusammen ist durch die Batterie begrenzt.
 */

export type Axle = 'front' | 'rear' | 'split';

export interface DriveUnit {
  id: string;
  /** Übersetzungsschlüssel für Diagrammbeschriftung. */
  kind: 'engine' | 'hybrid' | 'motor';
  axle: Axle;
  /** Gesamtübersetzungen (Gang · Achse bzw. Untersetzung), absteigend. */
  ratios: number[];
  /** CVT: stufenlos zwischen ratios[0] und ratios[1]. */
  cvt: boolean;
  /** Volllastmoment an der Antriebswelle bei Wellendrehzahl ω, N·m (Verbrenner + E-Anteil). */
  torque: (omega: number) => number;
  /** Davon elektrischer Anteil (für die Batteriegrenze), N·m. */
  electricTorque: (omega: number) => number;
  maxSpeed: number;
  idleSpeed: number;
  /** Drehzahl beim Anfahren mit schleifender Kupplung (0 = Anfahren aus dem Stand ohne Kupplung). */
  launchSpeed: number;
  converter: boolean;
  shiftTime: number;
  efficiency: number;
  /** Koeffizient des Drehmassenzuschlags δ = 1,04 + k · i² (Rotorträgheit je nach Bauart). */
  inertia: number;
  /** Drehzahl bestes Moment/Leistung für CVT und Schaltpunkte. */
  peakPowerSpeed: number;
}

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

/** Wirkungsgrad des Schaltgetriebes inkl. Achsantrieb. */
export function gearboxEfficiency(car: Car): number {
  const dt = car.drivetrain;
  const box = { manual: 0.95, sequential: 0.95, dct: 0.94, automatic: 0.9, cvt: 0.86 }[dt.gearbox];
  return box * (dt.layout === 'awd' ? 0.95 : 1) * (1 + 0.003 * dt.quality);
}

/** Wirkungsgrad einer festen Untersetzung (E-Achse). */
export const REDUCTION_EFFICIENCY = 0.97;

export function driveUnits(car: Car, engine: EngineAnalysis | undefined): DriveUnit[] {
  const pt = car.powertrain;
  const dt = car.drivetrain;
  const units: DriveUnit[] = [];
  const gearboxAxle: Axle = dt.layout === 'fwd' ? 'front' : dt.layout === 'rwd' ? 'rear' : 'split';

  if (pt.engine && engine) {
    const curve = engine.curve;
    const p2 = pt.motors.find((m) => m.position === 'gearbox');
    const revLimit = pt.engine.variant.revLimit;
    const electric = (omega: number) => (p2 ? motorTorque(p2, omega) : 0);
    units.push({
      id: 'engine',
      kind: p2 ? 'hybrid' : 'engine',
      axle: gearboxAxle,
      ratios: dt.ratios.map((i) => i * dt.finalDrive),
      cvt: dt.gearbox === 'cvt',
      torque: (omega) => torqueAt(curve, omega) + electric(omega),
      electricTorque: electric,
      maxSpeed: revLimit,
      idleSpeed: curve.points[0]!.speed,
      launchSpeed: Math.min(
        0.8 * revLimit,
        Math.max(rpm(2500), curve.peakTorque.speed * (car.trim.assists.launchControl ? 0.9 : 0.7)),
      ),
      converter: dt.gearbox === 'automatic',
      shiftTime: { manual: 0.35, automatic: 0.25, dct: 0.06, sequential: 0.1, cvt: 0 }[dt.gearbox],
      efficiency: gearboxEfficiency(car),
      inertia: 0.0015,
      peakPowerSpeed: curve.peakPower.speed,
    });
  }

  for (const m of pt.motors) {
    if (m.position === 'gearbox') continue;
    units.push({
      id: `motor-${m.id}`,
      kind: 'motor',
      axle: m.position,
      ratios: [m.reduction],
      cvt: false,
      torque: (omega) => motorTorque(m, omega),
      electricTorque: (omega) => motorTorque(m, omega),
      maxSpeed: m.maxSpeed,
      idleSpeed: 0,
      launchSpeed: 0,
      converter: false,
      shiftTime: 0,
      efficiency: REDUCTION_EFFICIENCY,
      inertia: 0.0008,
      peakPowerSpeed: m.maxSpeed * 0.5,
    });
  }
  return units;
}

/** Maximal verfügbare elektrische Antriebsleistung an den Motorwellen (Batteriegrenze), W. */
export function electricPowerLimit(car: Car): number {
  const b = car.powertrain.battery;
  if (!b) return 0;
  const motors = car.powertrain.motors;
  const eta = motors.length
    ? motors.reduce((a, m) => a + motorEfficiency(m, m.maxSpeed * 0.4, unitPeakPower(m) * 0.8), 0) /
      motors.length
    : 1;
  return batteryMaxPower(b) * BATTERY_EFFICIENCY * eta;
}

/**
 * Anteil der Traktionsgrenze, der beim Beschleunigen nutzbar ist: Achsdifferenzial (offen verliert
 * am entlasteten Rad), Einzelradmotoren nahezu ideal; Traktionskontrolle und Launch Control holen
 * einen Teil des Rests.
 */
export function tractionUtilization(car: Car, axle: 'front' | 'rear'): number {
  const independent = car.powertrain.motors.some((m) => m.position === axle && m.count === 2);
  const isGearboxAxle =
    car.powertrain.engine !== undefined &&
    (car.drivetrain.layout === 'awd' ||
      (axle === 'front' ? car.drivetrain.layout === 'fwd' : car.drivetrain.layout === 'rwd'));
  const diff = independent
    ? 0.97
    : isGearboxAxle || car.powertrain.type === 'electric'
      ? { open: 0.86, viscous: 0.9, 'plate-lsd': 0.93, torsen: 0.92, active: 0.96 }[
          car.drivetrain.differential
        ]
      : 0.9;
  let u = diff;
  if (car.trim.assists.tcs) u += (1 - u) * 0.4;
  if (car.trim.assists.launchControl) u += (1 - u) * 0.7;
  return u;
}

/**
 * Momentenübertragung des Mitteldifferenzials bei Allrad über das Getriebe: Anteil des Überschusses
 * einer durchdrehenden Achse, der zur anderen Achse umgeleitet wird (offen 0, aktiv 1).
 */
export function centerTransfer(car: Car): number {
  return { open: 0, viscous: 0.35, 'plate-lsd': 0.55, torsen: 0.65, active: 1 }[
    car.drivetrain.differential
  ];
}
