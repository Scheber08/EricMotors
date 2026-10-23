import type { Car } from '@ericmotors/schema';
import { ELECTRICITY_PRICE, FUELS, G } from '../constants';
import { batteryDurability } from '../electric/battery';
import type { EngineAnalysis } from '../engine/analyze';
import type { Warning } from '../engine/properties';
import type { PowertrainSummary } from './analyze';
import { stiffnessIndex } from './chassis';
import { electricPowerLimit, torqueAt } from './drive';
import type { CarGeometry } from './geometry';
import type { MassProperties } from './mass';
import { engineX } from './mass';
import { brakeCapacity } from './performance';
import type { Performance } from './performance';
import type { TireProperties } from './tires';

/**
 * Auto-Ratings 0–100 nach dem Vorbild von Automation. Jedes Rating ist eine gewichtete Summe
 * normierter Teilgrößen (0..1); Gewichte und Bereiche siehe docs/MODELS.md § Auto-Ratings.
 * Elektro- und Hybridantrieb fließen über Laufruhe, Drehmomentverlauf, Energiekosten, Reichweite,
 * Ladezeit und Zuverlässigkeit ein.
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
  /** Umweltverträglichkeit: CO₂ am Auspuff und Schadstoffe. */
  environment: number;
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
  engine: EngineAnalysis | undefined;
  performance: Performance;
  powertrain: PowertrainSummary;
  /** Torsionssteifigkeit, N·m/rad. */
  stiffness: number;
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

/** Energiekosten in € pro 100 km (Kraftstoff + Strom) – vergleichbar über alle Antriebsarten. */
export function energyCostPer100km(car: Car, p: Performance): number {
  const engine = car.powertrain.engine;
  const fuel = engine
    ? p.fuelPerDistance * 1e5 * 1000 * FUELS[engine.variant.fuel].pricePerLiter
    : 0;
  const electric = ((p.electricPerDistance * 1e5) / 3.6e6) * ELECTRICITY_PRICE;
  return fuel + electric;
}

export function carRatings(ctx: RatingContext): CarRatings {
  const { car, geometry: g, mass, engine, performance: p, powertrain: ps } = ctx;
  const { trim, drivetrain: dt, suspension: s, model } = car;
  const pt = car.powertrain;
  const electricOnly = pt.type === 'electric';
  const hybrid = pt.type === 'hybrid';
  const powerToMass = ps.systemPower / p.testMass; // W/kg
  const assistCount = [trim.assists.abs, trim.assists.tcs, trim.assists.esc].filter(Boolean).length;
  const avgQuality =
    (model.quality +
      trim.quality +
      dt.quality +
      s.quality +
      car.wheels.quality +
      car.brakes.quality) /
    6;
  const chassis = stiffnessIndex(ctx.stiffness);

  // Drehmomentverlauf: kleinstes Moment zwischen 2000/min und 80 % des Leistungsmaximums relativ zum
  // Spitzenmoment. E-Motoren liefern vom Stand weg volles Moment; ein Hybrid füllt Lücken auf.
  let flatness = 1;
  if (engine) {
    const lo = (2000 * Math.PI) / 30;
    const hi = 0.8 * engine.curve.peakPower.speed;
    let minTorque = Infinity;
    for (let w = lo; w <= hi; w += 20) minTorque = Math.min(minTorque, torqueAt(engine.curve, w));
    flatness = Number.isFinite(minTorque) ? minTorque / engine.curve.peakTorque.torque : 0.5;
    if (hybrid) flatness = Math.min(1, flatness + 0.2);
  }

  const springStiffness = (s.front.springStiffness + s.rear.springStiffness) / 2;
  const damping = (s.front.damping + s.rear.damping) / 2;
  const sidewall = (car.wheels.front.aspectRatio + car.wheels.rear.aspectRatio) / 2;
  const gearboxEase = electricOnly
    ? 1
    : { automatic: 1, cvt: 0.9, dct: 0.85, manual: 0.35, sequential: 0.2 }[dt.gearbox];
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
  const smoothness = engine && !electricOnly ? engine.ratings.smoothness / 100 : 1;
  const noise = pt.engine
    ? { none: 0, 'straight-through': 0.3, baffled: 0.65, 'reverse-flow': 1 }[
        pt.engine.variant.muffler
      ]
    : 1;
  const responsiveness = engine
    ? Math.min(1, engine.ratings.responsiveness / 100 + (hybrid ? 0.15 : 0))
    : 1;
  const overpowered = !trim.assists.tcs && dt.layout !== 'awd' ? norm(powerToMass, 150, 300) : 0;
  const costPer100 = energyCostPer100km(car, p);
  const charging = p.chargeTime === null ? (electricOnly ? 0 : 1) : norm(p.chargeTime / 60, 60, 15);

  const drivability = score([
    [flatness, 2],
    [gearboxEase, 1.5],
    [assistCount / 3, 1.5],
    [steering, 1],
    [responsiveness, 1],
    [1 - Math.abs(p.balance - 0.05) * 3, 1],
    [1 - overpowered, 1.5],
  ]);

  const sportiness = score([
    [norm(accel, 12, 3), 3],
    [norm(lateralG, 0.75, 1.25), 2.5],
    [norm(p.braking100to0, 45, 30), 1.5],
    [norm(p.fadeStops, 3, 15), 1],
    [norm(powerToMass, 50, 350), 2],
    [norm(mass.total, 2000, 900), 1],
    [chassis, 0.75],
    [
      electricOnly
        ? 0.6
        : { automatic: 0.3, cvt: 0, dct: 1, manual: 0.7, sequential: 1 }[dt.gearbox],
      0.5,
    ],
    [trim.interior === 'sport' || trim.interior === 'race' ? 1 : 0.3, 0.5],
  ]);

  const comfort = score([
    [1 - springStiffness, 2],
    [1 - Math.abs(damping - 0.4) * 2, 1],
    [{ passive: 0.4, progressive: 0.6, hydropneumatic: 1, air: 1 }[s.springs], 1],
    [{ 'twin-tube': 0.5, 'mono-tube': 0.4, adaptive: 1 }[s.dampers], 1],
    [interiorLevel, 2],
    [entertainment, 1],
    [smoothness, 1.5],
    [noise, 1],
    [norm(sidewall, 0.3, 0.6), 1],
    [chassis, 0.5],
    [norm(car.suspension.rideHeight, 0.08, 0.16), 0.5],
  ]);

  const safety = score([
    [safetyLevel, 3],
    [assistCount / 3, 2],
    [norm(p.braking100to0, 50, 33), 1.5],
    [norm(p.fadeStops, 2, 10), 0.5],
    [norm(mass.total, 900, 2000), 1],
    [
      { monocoque: 1, spaceframe: 0.6, ladder: 0.5 }[model.chassis] *
        (model.chassisMaterial === 'cfrp' ? 1.1 : 1),
      1,
    ],
    [chassis, 0.5],
    [norm(lateralG, 0.7, 1.0), 1],
  ]);

  const practicality = score([
    [norm(trim.seats, 1, 7), 2.5],
    [cargoIndex(car, g) * (electricOnly ? 1.05 : 1), 2],
    [norm(costPer100, 20, 4), 1.5],
    [norm(p.range, 250e3, 900e3), 1],
    [charging, electricOnly ? 1 : 0],
    [norm(car.suspension.rideHeight, 0.08, 0.2), 0.5],
    [interiorLevel, 0.5],
  ]);

  // Zugfähigkeit: höchstes Radmoment relativ zum Gewicht (über alle Antriebseinheiten).
  const wheelForce = Math.max(
    ...p.traction.map((c) => Math.max(0, ...c.points.map((pt2) => pt2.force))),
  );
  const rearDriven = dt.layout !== 'fwd' ? 1 : 0.4;
  const utility = score([
    [norm(wheelForce / (p.testMass * G), 0.3, 1.0), 2],
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
    [norm(p.range, 250e3, 800e3), 0.5],
    [springStiffness, 0.5],
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
    [
      pt.motors.some((m) => m.count === 2)
        ? 1
        : { open: 0, viscous: 0.6, 'plate-lsd': 0.7, torsen: 0.8, active: 1 }[dt.differential],
      1,
    ],
  ]);

  // Zuverlässigkeit: Verbrenner (Rating) bzw. E-Antrieb (wenige Verschleißteile, Batteriealterung).
  const engineReliability = engine ? engine.ratings.reliability / 100 : 1;
  const electricReliability = pt.battery
    ? 0.75 * batteryDurability(pt.battery) + 0.25 + 0.02 * avgQuality
    : 1;
  const powertrainReliability = electricOnly
    ? 0.85 * electricReliability + 0.1
    : hybrid
      ? 0.8 * engineReliability + 0.2 * electricReliability - 0.05
      : engineReliability;
  const gearboxReliability = electricOnly
    ? 1
    : { manual: 1, sequential: 0.7, dct: 0.6, automatic: 0.8, cvt: 0.55 }[dt.gearbox];
  const reliability = score([
    [powertrainReliability, 4],
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
  // Exklusivität des Antriebs: viele Zylinder bzw. viele/große E-Motoren.
  const exclusivity = pt.engine
    ? norm(pt.engine.family.cylinders, 3, 12)
    : norm(
        pt.motors.reduce((a, m) => a + m.count, 0),
        1,
        4,
      );
  const prestige = score([
    [
      { basic: 0, standard: 0.3, premium: 0.7, luxury: 1, sport: 0.55, race: 0.4 }[trim.interior],
      3,
    ],
    [entertainment, 1],
    [premiumMaterial, 1],
    [exclusivity, 1.5],
    [norm(ps.systemPower, 80e3, 600e3), 1.5],
    [norm(avgQuality, -5, 5), 1.5],
    [finish, 0.5],
    [smoothness, 1],
  ]);

  const emissions = engine ? engine.ratings.emissions / 100 : 1;
  const environment = score([
    [norm(p.co2PerDistance * 1e6, 250, 0), 3],
    [emissions, electricOnly ? 0 : 1.5],
    [norm((p.electricPerDistance * 1e5) / 3.6e6 + p.fuelPerDistance * 1e8 * 8.9, 80, 12), 1],
    [norm(mass.total, 2400, 900), 0.5],
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
    environment,
  };
}

/** Plausibilitäts- und Kompatibilitätsprüfungen des Autos mit Lösungsvorschlag (über `code`). */
export function carWarnings(ctx: RatingContext): Warning[] {
  const { car, geometry: g, mass, tires, engine, performance: p, powertrain: ps } = ctx;
  const out: Warning[] = [];
  const pt = car.powertrain;
  const tireWidth = Math.max(car.wheels.front.width, car.wheels.rear.width);

  // ---------- Verbrenner: Bauraum und Getriebe ----------
  if (pt.engine && engine) {
    const dims = engine.dimensions;
    const placement = pt.engine.placement;
    const path = 'powertrain.engine.placement';
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
          path,
          params: { need: dims.length, have: available },
        });
      const between = g.width - 2 * (tireWidth + 0.2);
      if (dims.width > between)
        out.push({
          code: 'car.engineTooWide',
          severity: 'error',
          path,
          params: { need: dims.width, have: between },
        });
    } else {
      const available = g.width - 2 * (tireWidth + 0.15);
      if (dims.length + 0.35 > available)
        out.push({
          code: 'car.engineTooLongTransverse',
          severity: 'error',
          path,
          params: { need: dims.length + 0.35, have: available },
        });
      if (placement === 'mid-transverse' && g.wheelbase - 1.7 < dims.width)
        out.push({ code: 'car.engineNoRoomMid', severity: 'error', path });
    }
    if (placement.startsWith('front') && dims.height + g.rideHeight + 0.05 > g.hoodHeight) {
      out.push({
        code: 'car.engineTooTall',
        severity: 'warning',
        path: 'model.morph.hoodHeight',
        params: { need: dims.height + g.rideHeight + 0.05, have: g.hoodHeight },
      });
    }
    const ex = engineX(car, g);
    if (placement.startsWith('front') && ex < -g.wheelbase + 1.5)
      out.push({
        code: 'car.cabinIntrusion',
        severity: 'warning',
        path: 'model.dimensions.wheelbase',
      });

    const p2 = pt.motors.find((m) => m.position === 'gearbox');
    const inputTorque =
      engine.curve.peakTorque.torque + (p2 ? p2.peakPower / (p2.maxSpeed * 0.33) : 0);
    const gearboxLimit =
      { manual: 600, sequential: 900, dct: 750, automatic: 900, cvt: 400 }[car.drivetrain.gearbox] *
      (1 + 0.05 * car.drivetrain.quality);
    if (inputTorque > gearboxLimit)
      out.push({
        code: 'car.gearboxTorque',
        severity: 'error',
        path: 'drivetrain.gearbox',
        params: { value: inputTorque, limit: gearboxLimit },
      });
    const driven = car.drivetrain.layout === 'fwd' ? tires.front : tires.rear;
    const launchForce =
      (inputTorque *
        car.drivetrain.ratios[0]! *
        car.drivetrain.finalDrive *
        p.drivetrainEfficiency) /
      driven.radius;
    if (launchForce < 0.3 * p.testMass * G)
      out.push({ code: 'car.firstGearTall', severity: 'warning', path: 'drivetrain.ratios' });
    const coolingCapacity = (0.3 + car.aero.cooling) * g.width * g.height * 200e3; // W, spielnah
    if (engine.curve.peakPower.power > coolingCapacity) {
      out.push({
        code: 'car.overheating',
        severity: 'warning',
        path: 'aero.cooling',
        params: { value: engine.curve.peakPower.power, limit: coolingCapacity },
      });
    }
  }

  // ---------- Elektrisch: Batterie, Reichweite, Laden ----------
  if (pt.battery) {
    const limit = electricPowerLimit(car);
    if (limit < 0.85 * ps.electricPower) {
      out.push({
        code: 'car.batteryLimitsPower',
        severity: 'warning',
        path: 'powertrain.battery.capacity',
        params: { battery: limit, motors: ps.electricPower },
      });
    }
    if (pt.type === 'electric' && p.range < 200e3)
      out.push({
        code: 'car.rangeShort',
        severity: 'warning',
        path: 'powertrain.battery.capacity',
        params: { range: p.range },
      });
    if (pt.type === 'hybrid' && pt.hybrid?.plugIn && (p.electricRange ?? 0) < 30e3)
      out.push({
        code: 'car.plugInRangeShort',
        severity: 'info',
        path: 'powertrain.battery.capacity',
      });
    if (pt.battery.cooling === 'passive' && (ps.batteryPower ?? 0) > 150e3)
      out.push({
        code: 'car.batteryCooling',
        severity: 'warning',
        path: 'powertrain.battery.cooling',
      });
    if (pt.type === 'electric' && p.chargeTime !== null && p.chargeTime > 60 * 60)
      out.push({ code: 'car.chargeSlow', severity: 'info', path: 'powertrain.battery.voltage' });
  }
  if (pt.type === 'electric') {
    const axles = new Set(pt.motors.map((m) => m.position));
    const expected =
      axles.has('front') && axles.has('rear') ? 'awd' : axles.has('front') ? 'fwd' : 'rwd';
    if (car.drivetrain.layout !== expected)
      out.push({ code: 'car.layoutMismatch', severity: 'info', path: 'drivetrain.layout' });
  }

  // ---------- Fahrleistung und Traktion ----------
  if (p.topSpeedLimitedBy === 'rev-limit') {
    out.push({
      code: pt.type === 'electric' ? 'car.motorSpeedLimit' : 'car.topGearShort',
      severity: 'info',
      path: pt.type === 'electric' ? 'powertrain.motors.0.reduction' : 'drivetrain.finalDrive',
    });
  }
  const powerToMass = ps.systemPower / p.testMass;
  if (powerToMass > 180 && car.drivetrain.layout === 'fwd')
    out.push({ code: 'car.fwdTooMuchPower', severity: 'info', path: 'drivetrain.layout' });
  if (powerToMass > 200 && !car.trim.assists.tcs && car.drivetrain.layout !== 'awd')
    out.push({ code: 'car.noTraction', severity: 'warning', path: 'trim.assists.tcs' });

  // ---------- Bremsen ----------
  if (brakeCapacity(car) < 1.15 * p.testMass * G * Math.max(tires.front.grip, tires.rear.grip))
    out.push({ code: 'car.brakesWeak', severity: 'warning', path: 'brakes.front.diameter' });
  if (p.fadeStops < 4)
    out.push({
      code: 'car.brakeFade',
      severity: 'warning',
      path: 'brakes.front.type',
      params: { stops: p.fadeStops },
    });

  // ---------- Räder und Fahrwerk ----------
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
  if (mass.frontWeightShare > 0.66 || mass.frontWeightShare < 0.36) {
    out.push({
      code: 'car.weightDistribution',
      severity: 'info',
      path: pt.engine ? 'powertrain.engine.placement' : 'powertrain.battery.capacity',
      params: { front: mass.frontWeightShare },
    });
  }
  if (Math.abs(p.balance) > 0.2)
    out.push({
      code: p.balance > 0 ? 'car.understeer' : 'car.oversteer',
      severity: 'info',
      path: 'suspension.front.antiRollBar',
    });
  if (stiffnessIndex(ctx.stiffness) < 0.1 && p.lateralAcceleration > 1.05 * G)
    out.push({ code: 'car.chassisFlex', severity: 'info', path: 'model.chassis' });

  if (car.model.shape === 'roadster' && car.trim.seats > 2)
    out.push({ code: 'car.roadsterSeats', severity: 'warning', path: 'trim.seats' });
  if (car.trim.seats > 5 && !['van', 'suv', 'wagon'].includes(car.model.shape))
    out.push({ code: 'car.tooManySeats', severity: 'warning', path: 'trim.seats' });
  return out;
}
