import { ENGINE_SCHEMA_VERSION, type Engine, type EngineVariant } from '../engine';
import { bar, deg, mm, rpm } from './units';

/**
 * Motor-Vorlagen. Werte an reale Serienmotoren *angelehnt* (öffentliche Herstellerangaben).
 * Kraftstoffe: regular = ROZ 91, premium = ROZ 95, super = ROZ 98.
 */

const variantDefaults: Omit<EngineVariant, 'id' | 'name' | 'bore' | 'stroke'> = {
  crankshaft: 'cast-iron',
  conrods: 'cast',
  pistons: 'cast',
  bottomEndQuality: 0,
  compressionRatio: 10.5,
  camProfile: 0.4,
  vvt: true,
  vvl: false,
  topEndQuality: 0,
  aspiration: { kind: 'natural' },
  aspirationQuality: 0,
  fuel: 'premium',
  fuelSystem: 'multi-point',
  intakeSize: 0.5,
  fuelQuality: 0,
  headers: 'cast',
  exhaustDiameter: mm(55),
  catalyst: 'three-way',
  muffler: 'reverse-flow',
  exhaustQuality: 0,
  lambda: 0.9,
  ignitionTiming: 0.6,
  revLimit: rpm(6_500),
};

const engine = (
  id: string,
  name: string,
  family: Engine['family'],
  variant: Partial<EngineVariant> & Pick<EngineVariant, 'bore' | 'stroke'>,
): Engine => ({
  schemaVersion: ENGINE_SCHEMA_VERSION,
  kind: 'engine',
  id,
  meta: { name, description: '', tags: [] },
  family,
  variants: [{ ...variantDefaults, id: 'base', name: 'Basis', ...variant }],
});

export type EngineTemplateId =
  'i4-16-na' | 'i4-20-na-sport' | 'i4-20-turbo' | 'v8-50-na' | 'i4-20-diesel';

export const ENGINE_TEMPLATES: Record<EngineTemplateId, () => Engine> = {
  /** Kompakter 1,6-l-Sauger, 16 V. */
  'i4-16-na': () =>
    engine(
      'a0e1b2c3-0001-4000-8000-000000000001',
      '1.6 Reihenvierer',
      {
        layout: 'inline',
        cylinders: 4,
        bankAngle: 0,
        blockMaterial: 'aluminium-sleeved',
        headMaterial: 'aluminium',
        headType: 'dohc',
        valvesPerCylinder: 4,
        maxBore: mm(80),
        maxStroke: mm(86),
        quality: 0,
      },
      {
        bore: mm(78),
        stroke: mm(83.6),
        compressionRatio: 10.5,
        camProfile: 0.35,
        revLimit: rpm(6_300),
      },
    ),
  /** Hochverdichteter 2,0-l-Sauger für Roadster. */
  'i4-20-na-sport': () =>
    engine(
      'a0e1b2c3-0002-4000-8000-000000000002',
      '2.0 Sport-Sauger',
      {
        layout: 'inline',
        cylinders: 4,
        bankAngle: 0,
        blockMaterial: 'aluminium',
        headMaterial: 'aluminium',
        headType: 'dohc',
        valvesPerCylinder: 4,
        maxBore: mm(85),
        maxStroke: mm(94),
        quality: 1,
      },
      {
        bore: mm(83.5),
        stroke: mm(91.2),
        compressionRatio: 13,
        camProfile: 0.55,
        fuelSystem: 'direct',
        headers: 'long-tubular',
        intakeSize: 0.6,
        revLimit: rpm(7_500),
        crankshaft: 'forged-steel',
        conrods: 'forged',
        pistons: 'forged',
      },
    ),
  /** 2,0-l-Turbo mit Direkteinspritzung. */
  'i4-20-turbo': () =>
    engine(
      'a0e1b2c3-0003-4000-8000-000000000003',
      '2.0 Turbo',
      {
        layout: 'inline',
        cylinders: 4,
        bankAngle: 0,
        blockMaterial: 'cast-iron',
        headMaterial: 'aluminium',
        headType: 'dohc',
        valvesPerCylinder: 4,
        maxBore: mm(84),
        maxStroke: mm(94),
        quality: 0,
      },
      {
        bore: mm(82.5),
        stroke: mm(92.8),
        compressionRatio: 9.6,
        camProfile: 0.45,
        aspiration: { kind: 'turbo', count: 1, size: 0.4, boost: bar(1.1), intercooler: 0.6 },
        fuelSystem: 'direct',
        conrods: 'forged',
        crankshaft: 'forged-steel',
        exhaustDiameter: mm(65),
        lambda: 0.85,
        revLimit: rpm(6_800),
      },
    ),
  /** 5,0-l-V8-Sauger, 32 V. */
  'v8-50-na': () =>
    engine(
      'a0e1b2c3-0004-4000-8000-000000000004',
      '5.0 V8',
      {
        layout: 'v',
        cylinders: 8,
        bankAngle: deg(90),
        blockMaterial: 'aluminium-sleeved',
        headMaterial: 'aluminium',
        headType: 'dohc',
        valvesPerCylinder: 4,
        maxBore: mm(94),
        maxStroke: mm(95),
        quality: 0,
      },
      {
        bore: mm(93),
        stroke: mm(92.7),
        compressionRatio: 12,
        camProfile: 0.6,
        fuelSystem: 'direct',
        intakeSize: 0.75,
        headers: 'long-tubular',
        exhaustDiameter: mm(70),
        crankshaft: 'forged-steel',
        conrods: 'forged',
        revLimit: rpm(7_500),
      },
    ),
  /** 2,0-l-Turbodiesel, Common Rail. */
  'i4-20-diesel': () =>
    engine(
      'a0e1b2c3-0005-4000-8000-000000000005',
      '2.0 Turbodiesel',
      {
        layout: 'inline',
        cylinders: 4,
        bankAngle: 0,
        blockMaterial: 'cast-iron',
        headMaterial: 'aluminium',
        headType: 'dohc',
        valvesPerCylinder: 4,
        maxBore: mm(82),
        maxStroke: mm(96),
        quality: 0,
      },
      {
        bore: mm(81),
        stroke: mm(95.5),
        compressionRatio: 16.2,
        camProfile: 0.2,
        vvt: false,
        aspiration: { kind: 'turbo', count: 1, size: 0.35, boost: bar(1.4), intercooler: 0.7 },
        fuel: 'diesel',
        fuelSystem: 'common-rail',
        catalyst: 'two-way',
        lambda: 1.3,
        ignitionTiming: 0.5,
        crankshaft: 'forged-steel',
        revLimit: rpm(4_800),
      },
    ),
};
