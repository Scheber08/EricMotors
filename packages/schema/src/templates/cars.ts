import {
  type Battery,
  CAR_SCHEMA_VERSION,
  type Car,
  type CarEngine,
  type ElectricMotor,
} from '../car';
import type { Engine } from '../engine';
import { ENGINE_TEMPLATES, type EngineTemplateId } from './engines';
import { deg, inch, mm, rpm } from './units';

/**
 * Auto-Vorlagen als Einstieg. Abmessungen und Übersetzungen an reale Fahrzeuge angelehnt,
 * aber keine Nachbauten.
 */

export type CarTemplateId =
  | 'light-roadster'
  | 'muscle-car'
  | 'hot-hatch'
  | 'diesel-wagon'
  | 'e-compact'
  | 'e-hypercar'
  | 'plugin-hybrid';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** Baut ein Auto-Motor-Objekt aus einer Motor-Vorlage (erste Variante). */
export function carEngineFrom(
  engine: Engine,
  placement: CarEngine['placement'],
  variantIndex = 0,
): CarEngine {
  const variant = engine.variants[variantIndex];
  if (!variant) throw new Error('Variante fehlt');
  return {
    source: { engineId: engine.id, variantId: variant.id },
    family: clone(engine.family),
    variant: clone(variant),
    placement,
  };
}

/** Grundauto mit soliden Standardwerten (Kompaktklasse, Frontmotor quer, Frontantrieb). */
export function baseCar(engineTemplate: EngineTemplateId = 'i4-16-na'): Car {
  return {
    schemaVersion: CAR_SCHEMA_VERSION,
    kind: 'car',
    id: '00000000-0000-4000-8000-000000000000',
    meta: { name: 'Neues Auto', description: '', tags: [] },
    model: {
      shape: 'hatchback',
      dimensions: {
        length: 4.25,
        width: 1.79,
        height: 1.45,
        wheelbase: 2.62,
        overhangFront: 0.87,
        trackFront: 0.86,
        trackRear: 0.85,
      },
      morph: {
        noseHeight: 0.5,
        hoodHeight: 0.5,
        windshieldRake: 0.5,
        roofLength: 0.5,
        rearSlope: 0.5,
        deckHeight: 0.5,
        beltline: 0.5,
        tumblehome: 0.5,
        frontTaper: 0.5,
        rearTaper: 0.5,
        archFlare: 0.2,
      },
      chassis: 'monocoque',
      chassisMaterial: 'galvanised-steel',
      frontSuspension: 'macpherson',
      rearSuspension: 'torsion-beam',
      quality: 0,
    },
    powertrain: {
      type: 'ice',
      engine: carEngineFrom(ENGINE_TEMPLATES[engineTemplate](), 'front-transverse'),
      motors: [],
    },
    trim: {
      bodyMaterial: 'galvanised-steel',
      interior: 'standard',
      seats: 5,
      entertainment: 'infotainment',
      safety: 'modern',
      powerSteering: 'electric',
      assists: { abs: true, tcs: true, esc: true, launchControl: false },
      quality: 0,
    },
    drivetrain: {
      layout: 'fwd',
      awdFrontShare: 0.5,
      gearbox: 'manual',
      ratios: [3.77, 2.09, 1.32, 0.98, 0.78],
      finalDrive: 4.06,
      differential: 'open',
      quality: 0,
    },
    suspension: {
      springs: 'passive',
      dampers: 'twin-tube',
      antiRoll: 'passive',
      front: { springStiffness: 0.4, damping: 0.4, antiRollBar: 0.4, camber: deg(-0.5) },
      rear: { springStiffness: 0.4, damping: 0.4, antiRollBar: 0.3, camber: deg(-1) },
      rideHeight: 0.14,
      quality: 0,
    },
    wheels: {
      rimDiameter: inch(16),
      rimMaterial: 'alloy',
      rimDesign: 'five-spoke',
      tireType: 'touring',
      front: { width: 0.205, aspectRatio: 0.55 },
      rear: { width: 0.205, aspectRatio: 0.55 },
      quality: 0,
    },
    brakes: {
      front: { type: 'vented-disc', diameter: mm(288), pistons: 1 },
      rear: { type: 'solid-disc', diameter: mm(253), pistons: 1 },
      pads: 'semi-metallic',
      bias: 0.7,
      quality: 0,
    },
    aero: { frontDownforce: 0, rearDownforce: 0, undertray: 'partial', cooling: 0.4 },
    paint: {
      base: { color: '#2f6fb3', finish: 'metallic', flake: 0.4, clearcoat: 0.85 },
      zones: [],
      decals: [],
    },
  };
}

function lightRoadster(): Car {
  const c = baseCar();
  c.id = '6f1c2a3e-0001-4000-8000-000000000001';
  c.meta.name = 'Leichter Roadster';
  c.model = {
    ...c.model,
    shape: 'roadster',
    dimensions: {
      length: 3.915,
      width: 1.735,
      height: 1.235,
      wheelbase: 2.31,
      overhangFront: 0.75,
      trackFront: 0.86,
      trackRear: 0.87,
    },
    morph: {
      ...c.model.morph,
      hoodHeight: 0.45,
      roofLength: 0,
      deckHeight: 0.6,
      windshieldRake: 0.55,
    },
    frontSuspension: 'double-wishbone',
    rearSuspension: 'multi-link',
  };
  c.powertrain.engine = carEngineFrom(ENGINE_TEMPLATES['i4-20-na-sport'](), 'front-longitudinal');
  c.trim = { ...c.trim, interior: 'sport', seats: 2, entertainment: 'radio' };
  c.drivetrain = {
    ...c.drivetrain,
    layout: 'rwd',
    ratios: [3.709, 2.19, 1.536, 1.177, 1.0, 0.832],
    finalDrive: 2.866,
    differential: 'plate-lsd',
  };
  c.suspension = {
    ...c.suspension,
    dampers: 'mono-tube',
    front: { ...c.suspension.front, springStiffness: 0.55 },
    rear: { ...c.suspension.rear, springStiffness: 0.5 },
    rideHeight: 0.135,
  };
  c.wheels = {
    ...c.wheels,
    rimDiameter: inch(17),
    rimDesign: 'multi-spoke',
    tireType: 'sport',
    front: { width: 0.205, aspectRatio: 0.45 },
    rear: { width: 0.205, aspectRatio: 0.45 },
  };
  c.brakes.front.diameter = mm(280);
  c.paint.base = {
    color: '#b3001b',
    finish: 'pearl',
    flake: 0.5,
    pearlColor: '#ff6a3d',
    clearcoat: 0.95,
  };
  return c;
}

function muscleCar(): Car {
  const c = baseCar();
  c.id = '6f1c2a3e-0002-4000-8000-000000000002';
  c.meta.name = 'Muscle Car';
  c.model = {
    ...c.model,
    shape: 'coupe',
    dimensions: {
      length: 4.79,
      width: 1.916,
      height: 1.381,
      wheelbase: 2.72,
      overhangFront: 0.92,
      trackFront: 0.83,
      trackRear: 0.86,
    },
    morph: {
      ...c.model.morph,
      noseHeight: 0.65,
      hoodHeight: 0.7,
      roofLength: 0.35,
      rearSlope: 0.75,
      archFlare: 0.5,
    },
    rearSuspension: 'multi-link',
  };
  c.powertrain.engine = carEngineFrom(ENGINE_TEMPLATES['v8-50-na'](), 'front-longitudinal');
  c.trim = { ...c.trim, interior: 'premium', seats: 4 };
  c.drivetrain = {
    ...c.drivetrain,
    layout: 'rwd',
    ratios: [3.66, 2.43, 1.69, 1.32, 1.0, 0.65],
    finalDrive: 3.55,
    differential: 'torsen',
  };
  c.wheels = {
    ...c.wheels,
    rimDiameter: inch(19),
    tireType: 'sport',
    front: { width: 0.255, aspectRatio: 0.4 },
    rear: { width: 0.275, aspectRatio: 0.4 },
  };
  c.brakes = {
    ...c.brakes,
    front: { type: 'vented-disc', diameter: mm(380), pistons: 6 },
    rear: { type: 'vented-disc', diameter: mm(352), pistons: 4 },
    bias: 0.62,
  };
  c.paint.base = { color: '#1d3557', finish: 'metallic', flake: 0.6, clearcoat: 0.9 };
  c.paint.decals = [
    { id: 'stripes', kind: 'stripe', color: '#f1faee', side: 'top', u: 0.5, v: 0.5, scale: 0.25 },
  ];
  return c;
}

function hotHatch(): Car {
  const c = baseCar('i4-20-turbo');
  c.id = '6f1c2a3e-0003-4000-8000-000000000003';
  c.meta.name = 'Turbo-Kompakter';
  c.trim = { ...c.trim, interior: 'sport' };
  c.drivetrain = {
    ...c.drivetrain,
    gearbox: 'dct',
    ratios: [3.46, 2.05, 1.3, 0.9, 0.77, 0.65],
    finalDrive: 4.12,
    differential: 'plate-lsd',
  };
  c.suspension = {
    ...c.suspension,
    dampers: 'adaptive',
    front: { ...c.suspension.front, springStiffness: 0.6 },
    rear: { ...c.suspension.rear, springStiffness: 0.55 },
    rideHeight: 0.125,
  };
  c.wheels = {
    ...c.wheels,
    rimDiameter: inch(19),
    tireType: 'sport',
    front: { width: 0.235, aspectRatio: 0.35 },
    rear: { width: 0.235, aspectRatio: 0.35 },
  };
  c.brakes.front = { type: 'vented-disc', diameter: mm(340), pistons: 2 };
  c.paint.base = { color: '#e8e8e8', finish: 'solid', flake: 0, clearcoat: 0.85 };
  return c;
}

function dieselWagon(): Car {
  const c = baseCar('i4-20-diesel');
  c.id = '6f1c2a3e-0004-4000-8000-000000000004';
  c.meta.name = 'Diesel-Kombi';
  c.model = {
    ...c.model,
    shape: 'wagon',
    dimensions: {
      length: 4.69,
      width: 1.83,
      height: 1.48,
      wheelbase: 2.79,
      overhangFront: 0.93,
      trackFront: 0.86,
      trackRear: 0.85,
    },
    rearSuspension: 'multi-link',
  };
  c.drivetrain = {
    ...c.drivetrain,
    gearbox: 'automatic',
    ratios: [4.71, 3.14, 2.11, 1.67, 1.29, 1.0, 0.84, 0.67],
    finalDrive: 3.07,
  };
  c.wheels = {
    ...c.wheels,
    rimDiameter: inch(17),
    front: { width: 0.225, aspectRatio: 0.5 },
    rear: { width: 0.225, aspectRatio: 0.5 },
  };
  c.aero.undertray = 'full';
  c.paint.base = { color: '#4a4f55', finish: 'metallic', flake: 0.35, clearcoat: 0.85 };
  return c;
}

const kwh = (x: number) => x * 3.6e6;
const kw = (x: number) => x * 1000;

const motor = (
  id: string,
  position: ElectricMotor['position'],
  peakKw: number,
  extra: Partial<ElectricMotor> = {},
): ElectricMotor => ({
  id,
  position,
  count: 1,
  type: 'pmsm',
  peakPower: kw(peakKw),
  maxSpeed: rpm(18_000),
  reduction: 9,
  cooling: 'liquid',
  quality: 0,
  ...extra,
});

const battery = (capacityKwh: number, extra: Partial<Battery> = {}): Battery => ({
  chemistry: 'nmc',
  cells: 'balanced',
  capacity: kwh(capacityKwh),
  voltage: '400V',
  cooling: 'liquid',
  quality: 0,
  ...extra,
});

/** Elektro-Limousine mit zwei Motoren (Allrad), angelehnt an die Model-3-Klasse. */
function eCompact(): Car {
  const c = baseCar();
  c.id = '6f1c2a3e-0005-4000-8000-000000000005';
  c.meta.name = 'E-Kompakt';
  c.model = {
    ...c.model,
    shape: 'sedan',
    dimensions: {
      length: 4.69,
      width: 1.85,
      height: 1.44,
      wheelbase: 2.875,
      overhangFront: 0.84,
      trackFront: 0.86,
      trackRear: 0.86,
    },
    morph: {
      ...c.model.morph,
      noseHeight: 0.2,
      hoodHeight: 0.3,
      windshieldRake: 0.85,
      roofLength: 0.55,
      rearSlope: 0.85,
    },
    rearSuspension: 'multi-link',
    frontSuspension: 'double-wishbone',
  };
  c.powertrain = {
    type: 'electric',
    motors: [motor('rear', 'rear', 220), motor('front', 'front', 150, { type: 'induction' })],
    battery: battery(75),
  };
  c.drivetrain = { ...c.drivetrain, layout: 'awd', awdFrontShare: 0.4 };
  c.trim = { ...c.trim, interior: 'premium', entertainment: 'premium-infotainment' };
  c.wheels = {
    ...c.wheels,
    rimDiameter: inch(18),
    rimDesign: 'aero',
    tireType: 'touring',
    front: { width: 0.235, aspectRatio: 0.45 },
    rear: { width: 0.235, aspectRatio: 0.45 },
  };
  c.brakes.front = { type: 'vented-disc', diameter: mm(320), pistons: 2 };
  c.aero = { ...c.aero, undertray: 'full', cooling: 0.15 };
  c.paint.base = {
    color: '#f4f4f4',
    finish: 'pearl',
    flake: 0.4,
    pearlColor: '#d9e2ff',
    clearcoat: 0.9,
  };
  return c;
}

/** Elektro-Hypercar mit vier Motoren (Torque Vectoring), angelehnt an den Rimac Nevera. */
function eHypercar(): Car {
  const c = baseCar();
  c.id = '6f1c2a3e-0006-4000-8000-000000000006';
  c.meta.name = 'E-Hypercar';
  c.model = {
    ...c.model,
    shape: 'coupe',
    dimensions: {
      length: 4.75,
      width: 1.99,
      height: 1.21,
      wheelbase: 2.75,
      overhangFront: 1.0,
      trackFront: 0.85,
      trackRear: 0.85,
    },
    morph: {
      ...c.model.morph,
      noseHeight: 0.15,
      hoodHeight: 0.15,
      windshieldRake: 0.9,
      roofLength: 0.3,
      rearSlope: 0.85,
      archFlare: 0.6,
      frontTaper: 0.7,
    },
    chassis: 'monocoque',
    chassisMaterial: 'cfrp',
    frontSuspension: 'double-wishbone',
    rearSuspension: 'double-wishbone',
  };
  c.powertrain = {
    type: 'electric',
    motors: [
      motor('front', 'front', 290, { count: 2, reduction: 6, maxSpeed: rpm(19_000) }),
      motor('rear', 'rear', 360, {
        count: 2,
        reduction: 6,
        maxSpeed: rpm(19_000),
        type: 'axial-flux',
      }),
    ],
    battery: battery(120, { chemistry: 'nca', cells: 'power', voltage: '800V' }),
  };
  c.drivetrain = { ...c.drivetrain, layout: 'awd', awdFrontShare: 0.45, differential: 'active' };
  c.trim = {
    ...c.trim,
    bodyMaterial: 'cfrp',
    interior: 'sport',
    seats: 2,
    entertainment: 'infotainment',
    assists: { abs: true, tcs: true, esc: true, launchControl: true },
  };
  c.suspension = {
    ...c.suspension,
    dampers: 'adaptive',
    antiRoll: 'active',
    rideHeight: 0.1,
    front: { ...c.suspension.front, springStiffness: 0.7 },
    rear: { ...c.suspension.rear, springStiffness: 0.7 },
  };
  c.wheels = {
    ...c.wheels,
    rimDiameter: inch(20),
    rimMaterial: 'forged',
    rimDesign: 'multi-spoke',
    tireType: 'semi-slick',
    front: { width: 0.275, aspectRatio: 0.35 },
    rear: { width: 0.315, aspectRatio: 0.3 },
  };
  c.brakes = {
    ...c.brakes,
    front: { type: 'carbon-ceramic', diameter: mm(390), pistons: 6 },
    rear: { type: 'carbon-ceramic', diameter: mm(390), pistons: 6 },
    pads: 'race',
    bias: 0.6,
  };
  c.aero = { frontDownforce: 0.4, rearDownforce: 0.4, undertray: 'full', cooling: 0.5 };
  c.paint.base = { color: '#0b3d91', finish: 'metallic', flake: 0.7, clearcoat: 0.95 };
  return c;
}

/** Plug-in-Hybrid: 1,4-Turbo mit E-Motor am Getriebe, angelehnt an den Golf GTE. */
function pluginHybrid(): Car {
  const c = baseCar('i4-14-turbo');
  c.id = '6f1c2a3e-0007-4000-8000-000000000007';
  c.meta.name = 'Plug-in-Hybrid';
  c.powertrain = {
    type: 'hybrid',
    engine: c.powertrain.engine!,
    motors: [motor('p2', 'gearbox', 85, { maxSpeed: rpm(7_000) })],
    battery: battery(13, { cells: 'power' }),
    hybrid: { plugIn: true },
  };
  c.drivetrain = {
    ...c.drivetrain,
    gearbox: 'dct',
    ratios: [3.46, 2.05, 1.3, 0.9, 0.77, 0.65],
    finalDrive: 4.12,
  };
  c.wheels = {
    ...c.wheels,
    rimDiameter: inch(17),
    front: { width: 0.225, aspectRatio: 0.45 },
    rear: { width: 0.225, aspectRatio: 0.45 },
  };
  c.brakes.front = { type: 'vented-disc', diameter: mm(312), pistons: 1 };
  c.paint.base = { color: '#1f6feb', finish: 'metallic', flake: 0.5, clearcoat: 0.9 };
  return c;
}

export const CAR_TEMPLATES: Record<CarTemplateId, () => Car> = {
  'light-roadster': lightRoadster,
  'muscle-car': muscleCar,
  'hot-hatch': hotHatch,
  'diesel-wagon': dieselWagon,
  'e-compact': eCompact,
  'e-hypercar': eHypercar,
  'plugin-hybrid': pluginHybrid,
};
