import { G } from '../constants';
import type { CarAnalysis } from '../car/analyze';
import type { TractionPoint } from '../car/performance';

/**
 * Echtzeit-Fahrmodell für die Testfahrt (docs/MODELS.md § Testfahrt). Spielnah, aber aus den
 * berechneten Fahrzeugwerten abgeleitet: Zugkraftkennfeld, Fahrwiderstand, Bremsweg,
 * Querbeschleunigung und Eigenlenkverhalten. Einspurmodell im Fahrzeugsystem
 * (u längs, w quer nach links, r Gierrate):
 *
 *   du/dt = a_x + w · r
 *   dw/dt = a_y,Reifen − u · r,   |a_y,Reifen| ≤ √(a_max² − a_x²)   (Kammscher Kreis)
 *
 * Reine Funktionen ohne three.js, damit sie im Spiel und in Tests wiederverwendbar sind.
 */

export interface DrivingModel {
  /** Masse inkl. Fahrer, kg. */
  mass: number;
  wheelbase: number;
  /** Dynamischer Radhalbmesser der Hinterachse, m. */
  wheelRadius: number;
  /** Zugkraft-Hüllkurve (bester Gang je Einheit, Summe), N je 1 m/s ab 0. */
  envelope: number[];
  /** Fahrwiderstand, N je 1 m/s ab 0. */
  resistance: number[];
  /** Gänge der Haupteinheit: Geschwindigkeitsbereich (für Ganganzeige und Drehzahl). */
  gears: { minSpeed: number; maxSpeed: number; points: TractionPoint[] }[];
  /** Haftgrenze beim Antreiben (angetriebene Achslast · μ), m/s². */
  tractionLimit: number;
  /** Größte Bremsverzögerung, m/s². */
  brakeLimit: number;
  /** Größte Querbeschleunigung, m/s². */
  lateralLimit: number;
  /** Eigenlenktendenz: > 0 Untersteuern, < 0 Übersteuern. */
  balance: number;
  topSpeed: number;
}

export interface DriveInput {
  /** Gaspedal 0..1. */
  throttle: number;
  /** Bremse 0..1; im Stand Rückwärtsgang. */
  brake: number;
  /** Lenkung −1 (rechts) .. 1 (links). */
  steer: number;
  handbrake: boolean;
}

/** Fahrbahn unter dem Auto: Haftungsfaktor und zusätzlicher Rollwiderstand (Anteil von g). */
export interface Surface {
  grip: number;
  drag: number;
}

export const ASPHALT: Surface = { grip: 1, drag: 0 };
export const GRASS: Surface = { grip: 0.55, drag: 0.07 };

export interface DriveState {
  /** Lage des Schwerpunkts in der Ebene (ISO: x, y nach links), m. */
  x: number;
  y: number;
  /** Gierwinkel, rad (0 = +x, gegen den Uhrzeigersinn positiv). */
  heading: number;
  /** Geschwindigkeit im Fahrzeugsystem, m/s. */
  u: number;
  w: number;
  /** Gierrate, rad/s. */
  r: number;
  /** Geglätteter Lenkeinschlag −1..1. */
  steer: number;
  /** Aktueller Gang ab 1, −1 = rückwärts. */
  gear: number;
  /** Restzeit der Zugkraftunterbrechung beim Schalten, s. */
  shiftTimer: number;
  /** Drehzahl relativ zum Gangbereich 0..1. */
  rpm: number;
  /** Längsbeschleunigung des letzten Schritts, m/s². */
  ax: number;
  /** Schräglaufwinkel des Fahrzeugs (Driften), rad. */
  slip: number;
  /** Raddrehwinkel, rad (für die Darstellung). */
  wheelAngle: number;
  /** Zurückgelegte Strecke, m. */
  distance: number;
}

const REVERSE_ACCEL = 3;
const REVERSE_SPEED = 8;
const SHIFT_TIME = 0.15;
/** Größter Lenkeinschlag der Vorderräder im Stand, rad. */
const MAX_STEER = 0.6;

function sampleCurve(points: TractionPoint[], vMax: number): number[] {
  const out: number[] = [];
  for (let v = 0; v <= vMax; v += 1) out.push(interpolate(points, v, false));
  return out;
}

/** Lineare Interpolation; außerhalb des Bereichs 0 (oder Randwert mit `clamp`). */
export function interpolate(points: TractionPoint[], v: number, clamp: boolean): number {
  if (points.length === 0) return 0;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (v < first.speed - 1e-9) return clamp ? first.force : 0;
  if (v <= first.speed) return first.force;
  if (v > last.speed + 1e-9) return clamp ? last.force : 0;
  let lo = 0;
  let hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid]!.speed <= v) lo = mid;
    else hi = mid;
  }
  const a = points[lo]!;
  const b = points[hi]!;
  return b.speed === a.speed
    ? a.force
    : a.force + ((b.force - a.force) * (v - a.speed)) / (b.speed - a.speed);
}

/** Wert einer im Abstand von 1 m/s abgetasteten Kurve. */
function lookup(table: number[], v: number): number {
  if (table.length === 0) return 0;
  const s = Math.max(0, v);
  const i = Math.floor(s);
  if (i >= table.length - 1) return table[table.length - 1]!;
  const f = s - i;
  return table[i]! * (1 - f) + table[i + 1]! * f;
}

/** Leitet das Fahrmodell aus der Analyse ab (läuft einmal je Fahrzeugstand). */
export function drivingModel(
  a: Pick<CarAnalysis, 'performance' | 'mass' | 'geometry' | 'tires'>,
): DrivingModel {
  const p = a.performance;
  const m = p.testMass;
  const vMax = Math.ceil(Math.max(p.topSpeed, 10) * 1.1);

  // Zugkraftkurven nach Einheit gruppieren: jede Einheit beginnt mit Gang 1.
  const units: TractionPoint[][][] = [];
  for (const c of p.traction) {
    if (c.gear === 1 || units.length === 0) units.push([]);
    units[units.length - 1]!.push(c.points);
  }
  const envelope: number[] = [];
  for (let v = 0; v <= vMax; v += 1) {
    let total = 0;
    for (const gears of units) {
      let best = 0;
      gears.forEach((pts, i) => {
        // Unterhalb der Leerlaufdrehzahl des 1. Gangs fährt die Kupplung schleifend an.
        const f =
          i === 0 && v < (pts[0]?.speed ?? 0) ? (pts[0]?.force ?? 0) : interpolate(pts, v, false);
        best = Math.max(best, f);
      });
      total += best;
    }
    // Batteriegrenze und Schaltverluste stecken in der Systemleistung.
    if (v > 0) total = Math.min(total, p.systemPower / v);
    envelope.push(total);
  }

  const gears = (units[0] ?? []).map((points) => ({
    minSpeed: points[0]?.speed ?? 0,
    maxSpeed: points[points.length - 1]?.speed ?? vMax,
    points,
  }));

  const axles = new Set(p.traction.map((c) => c.axle));
  const wf = a.mass.frontWeightShare;
  // Lastverlagerung beim Beschleunigen (≈ 0,5 g) entlastet die Vorder- und belastet die Hinterachse.
  const transfer = (0.5 * a.mass.cgZ) / a.geometry.wheelbase;
  const drivenShare =
    axles.has('split') || axles.size > 1
      ? 1
      : axles.has('front')
        ? wf - transfer
        : 1 - wf + transfer;
  const mu = (a.tires.front.grip + a.tires.rear.grip) / 2;
  const v100 = 100 / 3.6;

  return {
    mass: m,
    wheelbase: a.geometry.wheelbase,
    wheelRadius: a.tires.rear.radius,
    envelope,
    resistance: sampleCurve(p.resistance, vMax),
    gears,
    tractionLimit: mu * G * Math.min(1, Math.max(0.3, drivenShare)),
    brakeLimit: (v100 * v100) / (2 * Math.max(p.braking100to0, 10)),
    lateralLimit: p.lateralAcceleration,
    balance: p.balance,
    topSpeed: p.topSpeed,
  };
}

export function initialDriveState(x = 0, y = 0, heading = 0): DriveState {
  return {
    x,
    y,
    heading,
    u: 0,
    w: 0,
    r: 0,
    steer: 0,
    gear: 1,
    shiftTimer: 0,
    rpm: 0,
    ax: 0,
    slip: 0,
    wheelAngle: 0,
    distance: 0,
  };
}

/** Bester Gang der Haupteinheit bei Geschwindigkeit v (größte Zugkraft). */
export function gearAt(model: DrivingModel, v: number): number {
  let best = 1;
  let force = -1;
  model.gears.forEach((g, i) => {
    if (v > g.maxSpeed + 1e-6) return;
    const f =
      i === 0 && v < g.minSpeed ? (g.points[0]?.force ?? 0) : interpolate(g.points, v, false);
    if (f > force) {
      force = f;
      best = i + 1;
    }
  });
  return best;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Lenkradius: Einschlag sinkt mit der Geschwindigkeit wie bei geschwindigkeitsabhängiger Lenkung. */
export function steerAngle(steer: number, speed: number): number {
  return (steer * MAX_STEER) / (1 + Math.abs(speed) / 14);
}

/**
 * Ein Zeitschritt des Fahrmodells. Gibt einen neuen Zustand zurück (unveränderlich).
 * `dt` sollte ≤ 1/60 s sein; die Darstellung ruft mehrere Teilschritte auf.
 */
export function stepDrive(
  model: DrivingModel,
  s: DriveState,
  input: DriveInput,
  dt: number,
  surface: Surface = ASPHALT,
): DriveState {
  const m = model.mass;
  const throttle = clamp(input.throttle, 0, 1);
  const brakeIn = clamp(input.brake, 0, 1);
  // Lenkung folgt der Eingabe verzögert (Lenkübersetzung, Tastatursteuerung).
  const steer = s.steer + (clamp(input.steer, -1, 1) - s.steer) * (1 - Math.exp(-dt * 7));
  const u = s.u;
  const speed = Math.hypot(u, s.w);
  const reverse = s.gear === -1;

  // ---------- Längsrichtung ----------
  let gear = s.gear;
  if (!reverse && brakeIn > 0 && throttle === 0 && u < 0.05) gear = -1;
  else if (reverse && throttle > 0 && u > -0.3) gear = 1;
  let shiftTimer = Math.max(0, s.shiftTimer - dt);
  if (gear >= 1 && shiftTimer === 0) {
    const v = Math.max(0, u);
    const target = gearAt(model, v);
    // Hochschalten unterbricht die Zugkraft (Stufengetriebe); Zurückschalten erst mit Abstand
    // zum Schaltpunkt, damit der Gang nicht pendelt.
    if (target > gear) {
      if (s.gear >= 1) shiftTimer = SHIFT_TIME;
      gear = target;
    } else if (target < gear && gearAt(model, v * 1.1) < gear) gear = target;
  }

  const aMax = model.lateralLimit * surface.grip;
  let drive: number;
  if (gear === -1) {
    drive = u > -REVERSE_SPEED ? -brakeIn * REVERSE_ACCEL : 0;
  } else {
    drive = shiftTimer > 0 ? 0 : (throttle * lookup(model.envelope, Math.max(0, u))) / m;
    drive = Math.min(drive, model.tractionLimit * surface.grip);
  }
  const brakeDir = gear === -1 ? (throttle > 0 ? 1 : 0) : brakeIn;
  let brake = brakeDir * model.brakeLimit * surface.grip;
  if (input.handbrake) brake = Math.max(brake, 0.35 * G * surface.grip);
  const roll = lookup(model.resistance, Math.abs(u)) / m + surface.drag * G;
  const decel = brake + roll;
  // Bremsen und Widerstand wirken gegen die Fahrtrichtung, ohne sie umzukehren.
  let ax: number;
  const du = drive * dt;
  const stop = decel * dt;
  let uNew = u + du;
  if (Math.abs(uNew) <= stop) {
    ax = -u / dt;
    uNew = 0;
  } else {
    uNew -= Math.sign(uNew) * stop;
    ax = (uNew - u) / dt;
  }

  // ---------- Querrichtung und Gieren ----------
  const delta = steerAngle(steer, speed);
  const vLong = uNew;
  const understeer = 0.0012 + 0.006 * Math.max(0, model.balance);
  let rTarget = (vLong * Math.tan(delta)) / (model.wheelbase * (1 + understeer * vLong * vLong));
  const axUsed = Math.min(Math.abs(ax), aMax);
  let latAvail = Math.sqrt(Math.max(0, aMax * aMax - axUsed * axUsed));
  if (input.handbrake) {
    // Blockierte Hinterräder: kaum Seitenführung hinten, das Heck kommt.
    latAvail *= 0.45;
    rTarget *= 1.5;
  }
  const absU = Math.abs(vLong);
  if (absU > 1 && Math.abs(vLong * rTarget) > latAvail) {
    // Grenzbereich: Untersteuern schiebt über die Vorderräder, Übersteuern dreht ein.
    const limit = latAvail / absU;
    const tendency = clamp(1 - 2.5 * model.balance, 0.6, 1.5) * (input.handbrake ? 1.6 : 1);
    rTarget = Math.sign(rTarget) * limit * tendency;
  }
  const r = s.r + (rTarget - s.r) * (1 - Math.exp(-dt * 9));

  // Reifen bauen Quergeschwindigkeit ab (Relaxation), begrenzt durch die verfügbare Haftung.
  const relax = 0.08;
  const needed = vLong * r - s.w / relax;
  const aY = clamp(needed, -latAvail, latAvail);
  let w = s.w + (aY - vLong * r) * dt;
  if (Math.abs(w) < 1e-4) w = 0;
  uNew += s.w * r * dt;

  // ---------- Lage ----------
  const heading = s.heading + r * dt;
  const c = Math.cos(heading);
  const sn = Math.sin(heading);
  const vx = uNew * c - w * sn;
  const vy = uNew * sn + w * c;
  const newSpeed = Math.hypot(uNew, w);

  // ---------- Anzeige: Gang und Drehzahl ----------
  let rpm: number;
  if (gear !== -1) {
    const g = model.gears[gear - 1];
    rpm = g ? clamp(Math.max(uNew, 0) / g.maxSpeed, 0.12, 1) : 0;
    if (throttle > 0 && uNew < (g?.minSpeed ?? 0)) rpm = Math.max(rpm, 0.35 * throttle + 0.12);
  } else {
    rpm = clamp(0.12 + Math.abs(uNew) / REVERSE_SPEED / 2, 0, 1);
  }

  return {
    x: s.x + vx * dt,
    y: s.y + vy * dt,
    heading,
    u: uNew,
    w,
    r,
    steer,
    gear,
    shiftTimer,
    rpm,
    ax,
    slip: newSpeed > 2 ? Math.atan2(w, Math.abs(uNew)) : 0,
    wheelAngle: s.wheelAngle + (uNew / model.wheelRadius) * dt,
    distance: s.distance + newSpeed * dt,
  };
}
