import { z } from 'zod';
import { Id, Meta, Quality, bounded, slider } from './primitives';

/**
 * Motor-Bibliothek nach dem Vorbild von *Automation*:
 * Eine Familie legt den Block fest, Varianten bauen darauf auf (Bohrung/Hub, Kurbeltrieb,
 * Ventiltrieb, Aufladung, Gemischaufbereitung, Abgas, Abstimmung).
 */

export const ENGINE_SCHEMA_VERSION = 1;

// ---------- Familie (Block und Kopf) ----------

export const EngineLayout = z.enum(['inline', 'v', 'boxer']);
export type EngineLayout = z.infer<typeof EngineLayout>;

/** Zulässige Zylinderzahlen je Anordnung. */
export const CYLINDERS_BY_LAYOUT: Record<EngineLayout, readonly number[]> = {
  inline: [2, 3, 4, 5, 6],
  v: [6, 8, 10, 12, 16],
  boxer: [2, 4, 6],
};

export const BlockMaterial = z.enum([
  'cast-iron',
  'cgi',
  'aluminium',
  'aluminium-sleeved',
  'magnesium',
]);
export type BlockMaterial = z.infer<typeof BlockMaterial>;

export const HeadMaterial = z.enum(['cast-iron', 'aluminium']);

/** Ventiltrieb: OHV mit Stößelstangen, obenliegende Nockenwelle(n). */
export const HeadType = z.enum(['ohv', 'sohc', 'dohc']);
export type HeadType = z.infer<typeof HeadType>;

export const EngineFamily = z.object({
  layout: EngineLayout,
  cylinders: z.number().int().min(2).max(16),
  /** Bankwinkel bei V-Motoren in rad (Boxer: π, Reihe: 0). */
  bankAngle: bounded(0, Math.PI),
  blockMaterial: BlockMaterial,
  headMaterial: HeadMaterial,
  headType: HeadType,
  valvesPerCylinder: z.number().int().min(2).max(5),
  /** Größte Bohrung und größter Hub, für die der Block ausgelegt ist (m). Bestimmt Blockgröße und -masse. */
  maxBore: bounded(0.05, 0.14),
  maxStroke: bounded(0.04, 0.14),
  quality: Quality,
});
export type EngineFamily = z.infer<typeof EngineFamily>;

// ---------- Variante ----------

export const Crankshaft = z.enum(['cast-iron', 'forged-steel', 'billet-steel']);
export const Conrods = z.enum(['cast', 'heavy-cast', 'forged', 'titanium']);
export const Pistons = z.enum(['cast', 'hypereutectic', 'forged', 'low-friction']);

export const Fuel = z.enum(['regular', 'premium', 'super', 'e85', 'diesel']);
export type Fuel = z.infer<typeof Fuel>;

export const FuelSystem = z.enum([
  'carburetor',
  'single-point',
  'multi-point',
  'direct',
  'diesel-indirect',
  'common-rail',
]);
export type FuelSystem = z.infer<typeof FuelSystem>;

export const Aspiration = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('natural') }),
  z.object({
    kind: z.literal('turbo'),
    count: z.number().int().min(1).max(2),
    /** Ladergröße: klein = früh ansprechend, groß = mehr Spitzenleistung. */
    size: slider(),
    /** Maximaler Ladedruck (Überdruck), Pa. */
    boost: bounded(10_000, 300_000),
    /** Ladeluftkühler-Größe (0 = keiner). */
    intercooler: slider(),
  }),
  z.object({
    kind: z.literal('supercharger'),
    type: z.enum(['roots', 'twin-screw', 'centrifugal']),
    size: slider(),
    boost: bounded(10_000, 200_000),
    intercooler: slider(),
  }),
]);
export type Aspiration = z.infer<typeof Aspiration>;

export const Headers = z.enum(['cast', 'short-tubular', 'long-tubular', 'equal-length']);
export const Catalyst = z.enum(['none', 'two-way', 'three-way', 'high-flow']);
export const Muffler = z.enum(['none', 'straight-through', 'baffled', 'reverse-flow']);

export const EngineVariant = z.object({
  id: Id,
  name: z.string().min(1).max(60),

  // Kurbeltrieb
  bore: bounded(0.05, 0.14),
  stroke: bounded(0.04, 0.14),
  crankshaft: Crankshaft,
  conrods: Conrods,
  pistons: Pistons,
  bottomEndQuality: Quality,

  // Zylinderkopf und Ventiltrieb
  compressionRatio: bounded(6, 24),
  /** Nockenprofil: 0 = sanft (Drehmoment unten), 1 = scharf (Leistung oben). */
  camProfile: slider(),
  vvt: z.boolean(),
  vvl: z.boolean(),
  topEndQuality: Quality,

  // Aufladung
  aspiration: Aspiration,
  aspirationQuality: Quality,

  // Gemischaufbereitung
  fuel: Fuel,
  fuelSystem: FuelSystem,
  /** Ansauggröße (Drosselklappe, Luftfilter, Saugrohr). */
  intakeSize: slider(),
  fuelQuality: Quality,

  // Abgasanlage
  headers: Headers,
  /** Durchmesser des Abgasrohrs, m. */
  exhaustDiameter: bounded(0.03, 0.12),
  catalyst: Catalyst,
  muffler: Muffler,
  exhaustQuality: Quality,

  // Abstimmung
  /** Luftverhältnis Lambda bei Volllast (Diesel: Mindest-Lambda / Rauchgrenze). */
  lambda: bounded(0.75, 2.5),
  /** Zündzeitpunkt: 0 = sehr spät (sicher), 1 = früh (mehr Leistung, Klopfgefahr). */
  ignitionTiming: slider(),
  /** Drehzahlbegrenzer, rad/s. */
  revLimit: bounded(150, 1_300),
});
export type EngineVariant = z.infer<typeof EngineVariant>;

const EngineObject = z.object({
  schemaVersion: z.literal(ENGINE_SCHEMA_VERSION),
  kind: z.literal('engine'),
  id: z.uuid(),
  meta: Meta,
  family: EngineFamily,
  variants: z.array(EngineVariant).min(1).max(12),
});

export const Engine = EngineObject.superRefine((e, ctx) => {
  const f = e.family;
  if (!CYLINDERS_BY_LAYOUT[f.layout].includes(f.cylinders)) {
    ctx.addIssue({
      code: 'custom',
      path: ['family', 'cylinders'],
      message: `${f.cylinders} Zylinder sind bei Anordnung „${f.layout}“ nicht möglich`,
    });
  }
  const ids = new Set<string>();
  e.variants.forEach((v, i) => {
    if (ids.has(v.id))
      ctx.addIssue({
        code: 'custom',
        path: ['variants', i, 'id'],
        message: 'doppelte Varianten-ID',
      });
    ids.add(v.id);
    if (v.bore > f.maxBore + 1e-9) {
      ctx.addIssue({
        code: 'custom',
        path: ['variants', i, 'bore'],
        message: 'Bohrung größer als der Block erlaubt',
      });
    }
    if (v.stroke > f.maxStroke + 1e-9) {
      ctx.addIssue({
        code: 'custom',
        path: ['variants', i, 'stroke'],
        message: 'Hub größer als der Block erlaubt',
      });
    }
    const diesel = v.fuel === 'diesel';
    const dieselSystem = v.fuelSystem === 'diesel-indirect' || v.fuelSystem === 'common-rail';
    if (diesel !== dieselSystem) {
      ctx.addIssue({
        code: 'custom',
        path: ['variants', i, 'fuelSystem'],
        message: diesel
          ? 'Diesel braucht eine Diesel-Einspritzung'
          : 'Diesel-Einspritzung nur mit Dieselkraftstoff',
      });
    }
  });
});
export type Engine = z.infer<typeof EngineObject>;
