import type { IceEngine } from '../modules/powertrain';
import type { Vehicle } from '../vehicle';
import { baseEngine, baseVehicle } from './base';
import { at, bar, deg, inch, mm, rpm } from './helpers';

/**
 * Vorlagen als Einstieg. Werte sind an reale Serienfahrzeuge *angelehnt* (öffentliche
 * Herstellerdaten), aber keine Nachbauten. Phase 1 enthält Verbrenner-Vorlagen; E-Hypercar und
 * Hybrid-Prototyp folgen mit den Phasen 3 und 4.
 */

export type TemplateId = 'light-roadster' | 'muscle-car' | 'hot-hatch';

export interface VehicleTemplate {
  id: TemplateId;
  build: () => Vehicle;
}

function engineOf(v: Vehicle): IceEngine {
  const e = v.powertrain.components.find((c) => c.type === 'ice');
  if (!e || e.type !== 'ice') throw new Error('Vorlage ohne Verbrenner');
  return e;
}

/** Leichter Roadster: 2,0-l-Saugmotor vorn längs, Hinterradantrieb, ~1 100 kg. */
function lightRoadster(): Vehicle {
  const v = baseVehicle();
  v.id = '6f1c2a3e-0001-4000-8000-000000000001';
  v.meta = { name: 'Leichter Roadster', description: '', tags: ['roadster', 'leicht'] };
  v.body.shape = 'roadster';
  v.body.dimensions = {
    length: 3.915,
    width: 1.735,
    height: 1.235,
    wheelbase: 2.31,
    trackFront: 1.495,
    trackRear: 1.505,
    overhangFront: 0.75,
    groundClearance: 0.135,
  };
  Object.assign(v.body.profile, {
    noseHeight: 0.45,
    hoodHeight: 0.66,
    cowlPosition: 0.42,
    windshieldAngle: deg(32),
    roofLength: 0,
    deckHeight: 0.72,
    tailHeight: 0.66,
    beltlineHeight: 0.72,
  });
  v.body.paint.base = {
    color: '#b3001b',
    finish: 'pearl',
    flake: 0.5,
    pearlColor: '#ff6a3d',
    clearcoat: 0.95,
  };
  for (const w of [v.body.wheels.front, v.body.wheels.rear]) {
    Object.assign(w, {
      rimDiameter: inch(17),
      rimWidth: inch(7),
      offset: mm(45),
      pitchCircleDiameter: mm(114.3),
      design: 'multi-spoke',
    });
  }
  v.body.interior = v.body.interior.filter((i) => i.kind !== 'insulation');

  const e = engineOf(v);
  Object.assign(e, {
    transform: at([-0.35, 0, 0.42]),
    bore: mm(83.5),
    stroke: mm(91.2),
    conrodLength: mm(154.5),
    compressionRatio: 13,
    mixture: 'direct-injection',
    revLimit: rpm(7_500),
  });
  e.intake.runnerLength = 0.42;
  e.exhaust = { kind: 'tubular-4-2-1', primaryLength: 0.45, primaryDiameter: mm(38) };

  v.powertrain.connections = [
    { from: 'fuel-tank', to: 'engine', medium: 'fuel' },
    { from: 'engine', to: 'clutch', medium: 'mechanical' },
    { from: 'clutch', to: 'gearbox', medium: 'mechanical' },
    { from: 'gearbox', to: 'diff-rear', medium: 'mechanical' },
  ];
  const tank = v.powertrain.components.find((c) => c.type === 'fuel-tank');
  if (tank?.type === 'fuel-tank') {
    tank.volume = 0.045;
    tank.transform = at([-1.85, 0, 0.35]);
  }
  v.drivetrain.layout = 'rwd';
  v.drivetrain.frontTorqueShare = 0;
  v.drivetrain.gearbox = {
    ...v.drivetrain.gearbox,
    ratios: [3.709, 2.19, 1.536, 1.177, 1.0, 0.832],
    finalDrive: 2.866,
    maxInputTorque: 300,
    transform: at([-0.85, 0, 0.35]),
  };
  v.drivetrain.differentials = [
    {
      id: 'diff-rear',
      position: 'rear',
      kind: 'plate-lsd',
      lockingDrive: 0.25,
      lockingCoast: 0.35,
      preload: 50,
      torqueVectoring: false,
    },
  ];
  v.suspension.front.kind = 'double-wishbone';
  v.tires.front = {
    width: 0.205,
    aspectRatio: 0.45,
    construction: 'radial',
    compound: 'sport',
    pressure: 200_000,
  };
  v.tires.rear = { ...v.tires.front };
  v.brakes.front.diameter = mm(280);
  v.brakes.bias = 0.65;
  v.systems.cooling.radiatorArea = 0.22;
  v.systems.hvac.installed = false;
  return v;
}

/** Muscle Car: 5,0-l-V8-Saugmotor, Hinterradantrieb, ~1 750 kg. */
function muscleCar(): Vehicle {
  const v = baseVehicle();
  v.id = '6f1c2a3e-0002-4000-8000-000000000002';
  v.meta = { name: 'Muscle Car', description: '', tags: ['v8', 'muscle'] };
  v.body.shape = 'coupe';
  v.body.dimensions = {
    length: 4.79,
    width: 1.916,
    height: 1.381,
    wheelbase: 2.72,
    trackFront: 1.582,
    trackRear: 1.648,
    overhangFront: 0.92,
    groundClearance: 0.14,
  };
  Object.assign(v.body.profile, {
    noseHeight: 0.5,
    hoodHeight: 0.7,
    cowlPosition: 0.4,
    windshieldAngle: deg(27),
    roofLength: 0.24,
    rearWindowAngle: deg(18),
    deckHeight: 0.72,
    tailHeight: 0.68,
    tumblehome: deg(18),
    frontTaper: 0.06,
    rearTaper: 0.06,
    wheelArchFlare: 0.02,
  });
  v.body.paint.base = { color: '#1d3557', finish: 'metallic', flake: 0.6, clearcoat: 0.9 };
  v.body.paint.decals = [
    { id: 'stripes', kind: 'stripe', color: '#f1faee', side: 'top', u: 0.5, v: 0.5, scale: 0.25 },
  ];
  v.body.wheels.front = {
    ...v.body.wheels.front,
    rimDiameter: inch(19),
    rimWidth: inch(9),
    offset: mm(45),
    pitchCircleDiameter: mm(114.3),
  };
  v.body.wheels.rear = { ...v.body.wheels.front, rimWidth: inch(9.5), offset: mm(52.5) };

  const e = engineOf(v);
  Object.assign(e, {
    transform: at([-0.3, 0, 0.5]),
    arrangement: 'v',
    cylinders: 8,
    bankAngle: deg(90),
    bore: mm(93),
    stroke: mm(92.7),
    conrodLength: mm(150.7),
    compressionRatio: 12,
    mixture: 'direct-injection',
    revLimit: rpm(7_500),
  });
  e.valvetrain.intakeValveDiameter = mm(37.7);
  e.valvetrain.exhaustValveDiameter = mm(31);
  e.valvetrain.timing.intakeLift = mm(13);
  e.valvetrain.timing.exhaustLift = mm(12);
  e.intake = {
    ...e.intake,
    runnerLength: 0.3,
    runnerDiameter: mm(48),
    plenumVolume: 0.009,
    throttleDiameter: mm(87),
  };
  e.exhaust = { kind: 'tubular-4-1', primaryLength: 0.75, primaryDiameter: mm(44) };

  v.powertrain.connections = [
    { from: 'fuel-tank', to: 'engine', medium: 'fuel' },
    { from: 'engine', to: 'clutch', medium: 'mechanical' },
    { from: 'clutch', to: 'gearbox', medium: 'mechanical' },
    { from: 'gearbox', to: 'diff-rear', medium: 'mechanical' },
  ];
  const tank = v.powertrain.components.find((c) => c.type === 'fuel-tank');
  if (tank?.type === 'fuel-tank') {
    tank.volume = 0.06;
    tank.transform = at([-2.35, 0, 0.35]);
  }
  v.drivetrain.layout = 'rwd';
  v.drivetrain.frontTorqueShare = 0;
  v.drivetrain.clutch = {
    ...v.drivetrain.clutch,
    kind: 'twin-plate',
    torqueCapacity: 750,
    flywheelInertia: 0.14,
  };
  v.drivetrain.gearbox = {
    ...v.drivetrain.gearbox,
    ratios: [3.66, 2.43, 1.69, 1.32, 1.0, 0.65],
    reverseRatio: 3.07,
    finalDrive: 3.55,
    maxInputTorque: 700,
    transform: at([-1.0, 0, 0.35]),
  };
  v.drivetrain.differentials = [
    {
      id: 'diff-rear',
      position: 'rear',
      kind: 'torsen',
      lockingDrive: 0.4,
      lockingCoast: 0.4,
      preload: 30,
      torqueVectoring: false,
    },
  ];
  v.suspension.front.springRate = 40_000;
  v.suspension.rear.springRate = 45_000;
  v.tires.front = {
    width: 0.255,
    aspectRatio: 0.4,
    construction: 'radial',
    compound: 'sport',
    pressure: 240_000,
  };
  v.tires.rear = { ...v.tires.front, width: 0.275 };
  v.brakes.front = {
    ...v.brakes.front,
    diameter: mm(380),
    thickness: mm(34),
    pistonsPerCaliper: 6,
    pistonDiameter: mm(36),
  };
  v.brakes.rear = {
    ...v.brakes.rear,
    diameter: mm(352),
    thickness: mm(25),
    ventilated: true,
    pistonsPerCaliper: 4,
    pistonDiameter: mm(30),
  };
  v.brakes.bias = 0.62;
  v.systems.exhaust = { ...v.systems.exhaust, layout: 'dual', pipeDiameter: mm(70), catalysts: 2 };
  v.systems.cooling.radiatorArea = 0.45;
  return v;
}

/** Turbo-Kompakter („Hot Hatch“): 2,0-l-Turbo, Doppelkupplung, Frontantrieb, ~1 400 kg. */
function hotHatch(): Vehicle {
  const v = baseVehicle();
  v.id = '6f1c2a3e-0003-4000-8000-000000000003';
  v.meta = { name: 'Turbo-Kompakter', description: '', tags: ['turbo', 'kompakt'] };
  v.body.shape = 'sedan';
  v.body.dimensions = {
    ...v.body.dimensions,
    length: 4.29,
    width: 1.79,
    height: 1.44,
    wheelbase: 2.63,
    overhangFront: 0.88,
  };
  Object.assign(v.body.profile, {
    roofLength: 0.38,
    rearWindowAngle: deg(50),
    deckHeight: 0.66,
    tailHeight: 0.6,
  });
  v.body.paint.base = { color: '#e8e8e8', finish: 'solid', flake: 0, clearcoat: 0.85 };

  const e = baseEngine();
  Object.assign(e, {
    compressionRatio: 9.6,
    mixture: 'direct-injection',
    revLimit: rpm(6_800),
    fullLoadLambda: 0.85,
  });
  e.induction = {
    kind: 'turbo',
    count: 1,
    arrangement: 'twin-scroll',
    boostPressure: bar(1.1),
    compressor: {
      maxPressureRatio: 2.6,
      peakEfficiency: 0.76,
      peakEfficiencyFlow: 0.13,
      chokeFlow: 0.24,
      surgeFlowAtMaxPr: 0.07,
    },
    turbine: { peakEfficiency: 0.72, aOverR: 0.00064, wastegate: true, rotorInertia: 2.5e-5 },
    intercooler: { kind: 'air-air', effectiveness: 0.75, pressureDrop: 12_000, coreVolume: 0.008 },
  };
  v.powertrain.components[0] = e;
  v.drivetrain.clutch = {
    id: 'clutch',
    kind: 'multi-plate-wet',
    torqueCapacity: 600,
    flywheelInertia: 0.08,
  };
  v.drivetrain.gearbox = {
    ...v.drivetrain.gearbox,
    kind: 'dct',
    ratios: [3.46, 2.05, 1.3, 0.9, 0.77, 0.65],
    finalDrive: 4.12,
    shiftTime: 0.1,
    maxInputTorque: 420,
  };
  v.drivetrain.differentials[0] = {
    ...v.drivetrain.differentials[0]!,
    kind: 'plate-lsd',
    lockingDrive: 0.3,
    lockingCoast: 0.1,
  };
  v.tires.front = { ...v.tires.front, width: 0.235, aspectRatio: 0.35, compound: 'sport' };
  v.tires.rear = { ...v.tires.front };
  for (const w of [v.body.wheels.front, v.body.wheels.rear]) {
    Object.assign(w, { rimDiameter: inch(19), rimWidth: inch(8) });
  }
  v.brakes.front.diameter = mm(340);
  v.brakes.front.thickness = mm(30);
  v.systems.cooling.radiatorArea = 0.38;
  return v;
}

export const TEMPLATES: readonly VehicleTemplate[] = [
  { id: 'light-roadster', build: lightRoadster },
  { id: 'muscle-car', build: muscleCar },
  { id: 'hot-hatch', build: hotHatch },
];

/** Erzeugt aus einer Vorlage ein neues, eigenständiges Fahrzeug mit frischer ID. */
export function instantiateTemplate(id: TemplateId, newId: string): Vehicle {
  const t = TEMPLATES.find((x) => x.id === id);
  if (!t) throw new Error(`unbekannte Vorlage ${id}`);
  return { ...t.build(), id: newId };
}

export { baseVehicle };
