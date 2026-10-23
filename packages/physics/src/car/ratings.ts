import type { Car } from '@ericmotors/schema';
import { G } from '../constants';
import type { EngineAnalysis } from '../engine/analyze';
import { type Warning } from '../engine/properties';
import { brakeCapacity, torqueAt } from './performance';
import type { Performance } from './performance';
import type { CarGeometry } from './geometry';
import type { MassProperties } from './mass';
import type { TireProperties } from './tires';
import { engineX } from './mass';

/**
 * Auto-Ratings 0–100 nach dem Vorbild von Automation. Jedes Rating ist eine gewichtete Summe
 * normierter Teilgrößen (0..1); Gewichte und Bereiche siehe docs/MODELS.md § Auto-Ratings.
 */

export interface CarRatings {
  drivability: number;
  sportiness: number;
  comfort: number;
  safety: number;
  practicality: number;
  utility: number;
  offroad: number;
  reliability: number;
  prestige: number;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** Lineare Normierung: `bad` → 0, `good` → 1 (auch absteigend möglich). */
const norm = (x: number, bad: number, good: number) => clamp01((x - bad) / (good - bad));
const score = (parts: [number, number][]) => {
  const weight = parts.reduce((a, [, w]) => a + w, 0);
  return Math.round((100 * parts.reduce((a, [v, w]) => a + clamp01(v) * w, 0)) / weight);
};

export interface RatingContext {
  car: Car;
  geometry: CarGeometry;
  mass: MassProperties;
  tires: TireProperties;
  engine: EngineAnalysis;
  performance: Performance;
}

/** Ladevolumen-Index 0..1 aus Karosserieform und Größe. */
function cargoIndex(car: Car, g: CarGeometry): number {
  const shape = {
    coupe: 0.35,
    sedan: 0.55,
    wagon: 0.85,
    hatchback: 0.6,
    suv: 0.8,
    roadster: 0.15,
    pickup: 0.9,
    van: 1,
  }[car.model.shape];
  return clamp01(shape * (g.volume / 11));
}

export function carRatings(ctx: RatingContext): CarRatings {
  const { car, geometry: g, mass, engine, performance: p } = ctx;
  const { trim, drivetrain: dt, suspension: s, model } = car;
  const powerToMass = engine.curve.peakPower.power / p.testMass; // W/kg
  const assistCount = [trim.assists.abs, trim.assists.tcs, trim.assists.esc].filter(Boolean).length;
  const avgQuality =
    (model.quality +
      trim.quality +
      dt.quality +
      s.quality +
      car.wheels.quality +
      car.brakes.quality) /
    6;

  // Drehmomentverlauf: kleinstes Moment zwischen 2000/min und 80 % des Leistungsmaximums relativ zum Spitzenmoment.
  const lo = (2000 * Math.PI) / 30;
  const hi = 0.8 * engine.curve.peakPower.speed;
  let minTorque = Infinity;
  for (let w = lo; w <= hi; w += 20) minTorque = Math.min(minTorque, torqueAt(engine.curve, w));
  const flatness = Number.isFinite(minTorque) ? minTorque / engine.curve.peakTorque.torque : 0.5;

  const stiffness = (s.front.springStiffness + s.rear.springStiffness) / 2;
  const damping = (s.front.damping + s.rear.damping) / 2;
  const sidewall = (car.wheels.front.aspectRatio + car.wheels.rear.aspectRatio) / 2;
  const gearboxEase = { automatic: 1, cvt: 0.9, dct: 0.85, manual: 0.35, sequential: 0.2 }[
    dt.gearbox
  ];
  const steering = { none: 0, hydraulic: 0.8, electric: 1 }[trim.powerSteering];
  const accel = p.accel0to100 ?? 30;
  const lateralG = p.lateralAcceleration / G;
  const interiorLevel = { basic: 0, standard: 0.35, premium: 0.7, luxury: 1, sport: 0.45, race: 0 }[
    trim.interior
  ];
  const entertainment = { none: 0, radio: 0.25, infotainment: 0.65, 'premium-infotainment': 1 }[
    trim.entertainment
  ];
  const safetyLevel = { basic: 0, standard: 0.35, advanced: 0.7, modern: 1 }[trim.safety];
  const noise = { none: 0, 'straight-through': 0.3, baffled: 0.65, 'reverse-flow': 1 }[
    car.engine.variant.muffler
  ];
  const overpowered = !trim.assists.tcs && dt.layout !== 'awd' ? norm(powerToMass, 150, 300) : 0;
  const litersPer100 = p.fuelPerDistance * 1e8;

  const drivability = score([
    [flatness, 2],
    [gearboxEase, 1.5],
    [assistCount / 3, 1.5],
    [steering, 1],
    [engine.ratings.responsiveness / 100, 1],
    [1 - Math.abs(p.balance - 0.05) * 3, 1],
    [1 - overpowered, 1.5],
  ]);

  const sportiness = score([
    [norm(accel, 12, 3), 3],
    [norm(lateralG, 0.75, 1.25), 2.5],
    [norm(p.braking100to0, 45, 30), 1.5],
    [norm(powerToMass, 50, 350), 2],
    [norm(mass.total, 2000, 900), 1],
    [{ automatic: 0.3, cvt: 0, dct: 1, manual: 0.7, sequential: 1 }[dt.gearbox], 0.5],
    [trim.interior === 'sport' || trim.interior === 'race' ? 1 : 0.3, 0.5],
  ]);

  const comfort = score([
    [1 - stiffness, 2],
    [1 - Math.abs(damping - 0.4) * 2, 1],
    [{ passive: 0.4, progressive: 0.6, hydropneumatic: 1, air: 1 }[s.springs], 1],
    [{ 'twin-tube': 0.5, 'mono-tube': 0.4, adaptive: 1 }[s.dampers], 1],
    [interiorLevel, 2],
    [entertainment, 1],
    [engine.ratings.smoothness / 100, 1.5],
    [noise, 1],
    [norm(sidewall, 0.3, 0.6), 1],
    [norm(car.suspension.rideHeight, 0.08, 0.16), 0.5],
  ]);

  const safety = score([
    [safetyLevel, 3],
    [assistCount / 3, 2],
    [norm(p.braking100to0, 50, 33), 1.5],
    [norm(mass.total, 900, 2000), 1],
    [
      { monocoque: 1, spaceframe: 0.6, ladder: 0.5 }[model.chassis] *
        (model.chassisMaterial === 'cfrp' ? 1.1 : 1),
      1,
    ],
    [norm(lateralG, 0.7, 1.0), 1],
  ]);

  const practicality = score([
    [norm(trim.seats, 1, 7), 2.5],
    [cargoIndex(car, g), 2],
    [norm(litersPer100, 15, 4), 1.5],
    [norm(p.range, 300e3, 900e3), 1],
    [norm(car.suspension.rideHeight, 0.08, 0.2), 0.5],
    [interiorLevel, 0.5],
  ]);

  const rearDriven = dt.layout !== 'fwd' ? 1 : 0.4;
  const utility = score([
    [norm(engine.curve.peakTorque.torque, 150, 600), 2],
    [rearDriven, 1],
    [{ monocoque: 0.4, spaceframe: 0.2, ladder: 1 }[model.chassis], 1.5],
    [
      {
        coupe: 0.1,
        sedan: 0.3,
        wagon: 0.7,
        hatchback: 0.4,
        suv: 0.7,
        roadster: 0,
        pickup: 1,
        van: 1,
      }[model.shape],
      2,
    ],
    [cargoIndex(car, g), 1],
    [stiffness, 0.5],
  ]);

  const solidAxles =
    (model.frontSuspension === 'solid-axle' ? 0.5 : 0) +
    (model.rearSuspension === 'solid-axle' ? 0.5 : 0);
  const approach = Math.min(g.overhangFront, g.overhangRear);
  const offroad = score([
    [norm(car.suspension.rideHeight, 0.12, 0.3), 3],
    [dt.layout === 'awd' ? 1 : dt.layout === 'rwd' ? 0.3 : 0.2, 2.5],
    [
      {
        eco: 0.1,
        touring: 0.2,
        sport: 0,
        'semi-slick': 0,
        slick: 0,
        'all-terrain': 0.75,
        offroad: 1,
      }[car.wheels.tireType],
      2,
    ],
    [solidAxles, 1],
    [{ monocoque: 0.4, spaceframe: 0.3, ladder: 1 }[model.chassis], 1],
    [norm(approach, 1.1, 0.6), 1],
    [{ open: 0, viscous: 0.6, 'plate-lsd': 0.7, torsen: 0.8, active: 1 }[dt.differential], 1],
  ]);

  const gearboxReliability = { manual: 1, sequential: 0.7, dct: 0.6, automatic: 0.8, cvt: 0.55 }[
    dt.gearbox
  ];
  const reliability = score([
    [engine.ratings.reliability / 100, 4],
    [gearboxReliability, 1.5],
    [norm(avgQuality, -5, 5), 2],
    [
      1 -
        (s.dampers === 'adaptive' ? 0.3 : 0) -
        (s.springs === 'air' || s.springs === 'hydropneumatic' ? 0.4 : 0),
      1,
    ],
    [1 - 0.15 * assistCount, 0.5],
  ]);

  const premiumMaterial = {
    steel: 0,
    'galvanised-steel': 0.15,
    aluminium: 0.6,
    fibreglass: 0.3,
    cfrp: 1,
  }[trim.bodyMaterial];
  const finish = { solid: 0.2, metallic: 0.5, pearl: 0.8, matte: 0.7, satin: 0.6, chrome: 1 }[
    car.paint.base.finish
  ];
  const prestige = score([
    [
      { basic: 0, standard: 0.3, premium: 0.7, luxury: 1, sport: 0.55, race: 0.4 }[trim.interior],
      3,
    ],
    [entertainment, 1],
    [premiumMaterial, 1],
    [norm(car.engine.family.cylinders, 3, 12), 1.5],
    [norm(engine.curve.peakPower.power, 80e3, 450e3), 1.5],
    [norm(avgQuality, -5, 5), 1.5],
    [finish, 0.5],
    [engine.ratings.smoothness / 100, 1],
  ]);

  return {
    drivability,
    sportiness,
    comfort,
    safety,
    practicality,
    utility,
    offroad,
    reliability,
    prestige,
  };
}

/** Plausibilitäts- und Kompatibilitätsprüfungen des Autos mit Lösungsvorschlag (über `code`). */
export function carWarnings(ctx: RatingContext): Warning[] {
  const { car, geometry: g, mass, tires, engine, performance: p } = ctx;
  const out: Warning[] = [];
  const dims = engine.dimensions;
  const placement = car.engine.placement;
  const tireWidth = Math.max(car.wheels.front.width, car.wheels.rear.width);

  // Bauraum Motor
  if (
    placement === 'front-longitudinal' ||
    placement === 'mid-longitudinal' ||
    placement === 'rear-longitudinal'
  ) {
    const available =
      placement === 'front-longitudinal'
        ? g.overhangFront + 0.45
        : placement === 'mid-longitudinal'
          ? g.wheelbase - 1.7
          : g.overhangRear + 0.3;
    if (dims.length > available)
      out.push({
        code: 'car.engineTooLong',
        severity: 'error',
        path: 'engine.placement',
        params: { need: dims.length, have: available },
      });
    const between = g.width - 2 * (tireWidth + 0.2);
    if (dims.width > between)
      out.push({
        code: 'car.engineTooWide',
        severity: 'error',
        path: 'engine.placement',
        params: { need: dims.width, have: between },
      });
  } else {
    const available = g.width - 2 * (tireWidth + 0.15);
    if (dims.length + 0.35 > available)
      out.push({
        code: 'car.engineTooLongTransverse',
        severity: 'error',
        path: 'engine.placement',
        params: { need: dims.length + 0.35, have: available },
      });
    if (placement === 'mid-transverse' && g.wheelbase - 1.7 < dims.width)
      out.push({ code: 'car.engineNoRoomMid', severity: 'error', path: 'engine.placement' });
  }
  if (placement.startsWith('front') && dims.height + g.rideHeight + 0.05 > g.hoodHeight) {
    out.push({
      code: 'car.engineTooTall',
      severity: 'warning',
      path: 'model.morph.hoodHeight',
      params: { need: dims.height + g.rideHeight + 0.05, have: g.hoodHeight },
    });
  }
  if (car.model.shape === 'roadster' && car.trim.seats > 2)
    out.push({ code: 'car.roadsterSeats', severity: 'warning', path: 'trim.seats' });
  if (car.trim.seats > 5 && !['van', 'suv', 'wagon'].includes(car.model.shape))
    out.push({ code: 'car.tooManySeats', severity: 'warning', path: 'trim.seats' });

  // Antrieb
  const gearboxLimit =
    { manual: 600, sequential: 900, dct: 750, automatic: 900, cvt: 400 }[car.drivetrain.gearbox] *
    (1 + 0.05 * car.drivetrain.quality);
  if (engine.curve.peakTorque.torque > gearboxLimit) {
    out.push({
      code: 'car.gearboxTorque',
      severity: 'error',
      path: 'drivetrain.gearbox',
      params: { value: engine.curve.peakTorque.torque, limit: gearboxLimit },
    });
  }
  const driven = car.drivetrain.layout === 'fwd' ? tires.front : tires.rear;
  const firstRatio = car.drivetrain.ratios[0]! * car.drivetrain.finalDrive;
  const launchForce =
    (engine.curve.peakTorque.torque * firstRatio * p.drivetrainEfficiency) / driven.radius;
  if (launchForce < 0.3 * p.testMass * 9.81)
    out.push({ code: 'car.firstGearTall', severity: 'warning', path: 'drivetrain.ratios' });
  if (p.topSpeedLimitedBy === 'rev-limit')
    out.push({ code: 'car.topGearShort', severity: 'info', path: 'drivetrain.finalDrive' });
  const powerToMass = engine.curve.peakPower.power / p.testMass;
  if (powerToMass > 180 && car.drivetrain.layout === 'fwd')
    out.push({ code: 'car.fwdTooMuchPower', severity: 'info', path: 'drivetrain.layout' });
  if (powerToMass > 200 && !car.trim.assists.tcs && car.drivetrain.layout !== 'awd')
    out.push({ code: 'car.noTraction', severity: 'warning', path: 'trim.assists.tcs' });

  // Bremsen und Kühlung
  if (brakeCapacity(car) < 1.15 * p.testMass * 9.81 * Math.max(tires.front.grip, tires.rear.grip)) {
    out.push({ code: 'car.brakesWeak', severity: 'warning', path: 'brakes.front.diameter' });
  }
  const coolingCapacity = (0.3 + car.aero.cooling) * g.width * g.height * 200e3; // W, spielnahe Kapazität
  if (engine.curve.peakPower.power > coolingCapacity) {
    out.push({
      code: 'car.overheating',
      severity: 'warning',
      path: 'aero.cooling',
      params: { value: engine.curve.peakPower.power, limit: coolingCapacity },
    });
  }

  // Räder und Fahrwerk
  const rimInch = car.wheels.rimDiameter / 0.0254;
  if (car.brakes.front.diameter > car.wheels.rimDiameter - 0.06)
    out.push({
      code: 'car.brakeRimClearance',
      severity: 'error',
      path: 'brakes.front.diameter',
      params: { rim: rimInch },
    });
  if (car.brakes.rear.diameter > car.wheels.rimDiameter - 0.06)
    out.push({
      code: 'car.brakeRimClearance',
      severity: 'error',
      path: 'brakes.rear.diameter',
      params: { rim: rimInch },
    });
  if (tireWidth > 0.12 * g.width + 0.07 * (1 + car.model.morph.archFlare))
    out.push({ code: 'car.tireTooWide', severity: 'warning', path: 'wheels.rear.width' });
  if (mass.frontWeightShare > 0.66 || mass.frontWeightShare < 0.36)
    out.push({
      code: 'car.weightDistribution',
      severity: 'info',
      path: 'engine.placement',
      params: { front: mass.frontWeightShare },
    });
  if (Math.abs(p.balance) > 0.2)
    out.push({
      code: p.balance > 0 ? 'car.understeer' : 'car.oversteer',
      severity: 'info',
      path: 'suspension.front.antiRollBar',
    });

  const ex = engineX(car, g);
  if (placement.startsWith('front') && ex < -g.wheelbase + 1.5)
    out.push({
      code: 'car.cabinIntrusion',
      severity: 'warning',
      path: 'model.dimensions.wheelbase',
    });
  return out;
}
