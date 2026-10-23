import { z } from 'zod';
import { EngineFamily, EngineVariant } from './engine';
import { Color, Id, Meta, Quality, bounded, slider } from './primitives';

/**
 * Auto nach dem Vorbild des Auto-Designers in *Automation*:
 * Modell → Motor → Ausstattung → Antriebsstrang → Fahrwerk → Räder → Bremsen → Aero → Lack.
 */

export const CAR_SCHEMA_VERSION = 1;

// ---------- Modell (Karosserie und Chassis) ----------

export const BodyShape = z.enum([
  'coupe',
  'sedan',
  'wagon',
  'hatchback',
  'suv',
  'roadster',
  'pickup',
  'van',
]);
export type BodyShape = z.infer<typeof BodyShape>;

/** Hauptabmessungen in m. Der hintere Überhang ergibt sich aus Länge − Radstand − vorderer Überhang. */
export const Dimensions = z.object({
  length: bounded(2.8, 6.5),
  width: bounded(1.4, 2.4),
  height: bounded(0.95, 2.2),
  wheelbase: bounded(1.9, 4.2),
  overhangFront: bounded(0.4, 1.5),
  /** Spurweite als Anteil der Fahrzeugbreite (vorn/hinten). */
  trackFront: bounded(0.75, 0.95),
  trackRear: bounded(0.75, 0.95),
});
export type Dimensions = z.infer<typeof Dimensions>;

/** Form-Regler (0..1) zum Verformen der Grundform, wie die Morph-Regler in Automation. */
export const Morph = z.object({
  noseHeight: slider(),
  hoodHeight: slider(),
  windshieldRake: slider(),
  roofLength: slider(),
  rearSlope: slider(),
  deckHeight: slider(),
  beltline: slider(),
  tumblehome: slider(),
  frontTaper: slider(),
  rearTaper: slider(),
  archFlare: slider(),
});
export type Morph = z.infer<typeof Morph>;

export const ChassisType = z.enum(['ladder', 'monocoque', 'spaceframe']);
export const ChassisMaterial = z.enum(['steel', 'galvanised-steel', 'aluminium', 'cfrp']);
export const FrontSuspension = z.enum(['solid-axle', 'macpherson', 'double-wishbone', 'pushrod']);
export const RearSuspension = z.enum([
  'solid-axle',
  'torsion-beam',
  'semi-trailing',
  'multi-link',
  'double-wishbone',
  'pushrod',
]);

export const Model = z.object({
  shape: BodyShape,
  dimensions: Dimensions,
  morph: Morph,
  chassis: ChassisType,
  chassisMaterial: ChassisMaterial,
  frontSuspension: FrontSuspension,
  rearSuspension: RearSuspension,
  quality: Quality,
});
export type Model = z.infer<typeof Model>;

// ---------- Motor ----------

export const EnginePlacement = z.enum([
  'front-longitudinal',
  'front-transverse',
  'mid-longitudinal',
  'mid-transverse',
  'rear-longitudinal',
]);
export type EnginePlacement = z.infer<typeof EnginePlacement>;

export const CarEngine = z.object({
  /** Herkunft in der Motor-Bibliothek; die Daten selbst sind als Kopie eingebettet. */
  source: z.object({ engineId: z.string().max(64), variantId: Id }).optional(),
  family: EngineFamily,
  variant: EngineVariant,
  placement: EnginePlacement,
});
export type CarEngine = z.infer<typeof CarEngine>;

// ---------- Ausstattung ----------

export const Trim = z.object({
  bodyMaterial: z.enum(['steel', 'galvanised-steel', 'aluminium', 'fibreglass', 'cfrp']),
  interior: z.enum(['basic', 'standard', 'premium', 'luxury', 'sport', 'race']),
  seats: z.number().int().min(1).max(9),
  entertainment: z.enum(['none', 'radio', 'infotainment', 'premium-infotainment']),
  safety: z.enum(['basic', 'standard', 'advanced', 'modern']),
  powerSteering: z.enum(['none', 'hydraulic', 'electric']),
  assists: z.object({
    abs: z.boolean(),
    tcs: z.boolean(),
    esc: z.boolean(),
    launchControl: z.boolean(),
  }),
  quality: Quality,
});
export type Trim = z.infer<typeof Trim>;

// ---------- Antriebsstrang ----------

export const Drivetrain = z.object({
  layout: z.enum(['fwd', 'rwd', 'awd']),
  /** Momentenanteil Vorderachse bei Allrad (0..1). */
  awdFrontShare: slider(),
  gearbox: z.enum(['manual', 'automatic', 'dct', 'sequential', 'cvt']),
  /** Übersetzungen der Vorwärtsgänge, absteigend (bei CVT: [größte, kleinste]). */
  ratios: z.array(bounded(0.3, 7)).min(2).max(10),
  finalDrive: bounded(1.5, 7),
  differential: z.enum(['open', 'viscous', 'plate-lsd', 'torsen', 'active']),
  quality: Quality,
});
export type Drivetrain = z.infer<typeof Drivetrain>;

// ---------- Fahrwerk ----------

export const AxleTune = z.object({
  springStiffness: slider(),
  damping: slider(),
  antiRollBar: slider(),
  /** Sturz in rad (negativ = Radoberkante nach innen). */
  camber: bounded(-0.09, 0.02),
});

export const Suspension = z.object({
  springs: z.enum(['passive', 'progressive', 'hydropneumatic', 'air']),
  dampers: z.enum(['twin-tube', 'mono-tube', 'adaptive']),
  antiRoll: z.enum(['none', 'passive', 'active']),
  front: AxleTune,
  rear: AxleTune,
  /** Bodenfreiheit, m. */
  rideHeight: bounded(0.05, 0.35),
  quality: Quality,
});
export type Suspension = z.infer<typeof Suspension>;

// ---------- Räder und Reifen ----------

export const TireType = z.enum([
  'eco',
  'touring',
  'sport',
  'semi-slick',
  'slick',
  'all-terrain',
  'offroad',
]);
export type TireType = z.infer<typeof TireType>;

export const AxleTire = z.object({
  /** Reifenbreite, m (225 mm = 0.225). */
  width: bounded(0.125, 0.355),
  /** Querschnittsverhältnis H/B. */
  aspectRatio: bounded(0.25, 0.85),
});

export const Wheels = z.object({
  /** Felgendurchmesser, m (17″ = 0.4318). */
  rimDiameter: bounded(0.3, 0.56),
  rimMaterial: z.enum(['steel', 'alloy', 'forged', 'magnesium', 'cfrp']),
  rimDesign: z.enum(['steel', 'five-spoke', 'multi-spoke', 'mesh', 'aero']),
  tireType: TireType,
  front: AxleTire,
  rear: AxleTire,
  quality: Quality,
});
export type Wheels = z.infer<typeof Wheels>;

// ---------- Bremsen ----------

export const AxleBrake = z.object({
  type: z.enum(['drum', 'solid-disc', 'vented-disc', 'carbon-ceramic']),
  /** Scheiben- bzw. Trommeldurchmesser, m. */
  diameter: bounded(0.2, 0.42),
  pistons: z.number().int().min(1).max(8),
});

export const Brakes = z.object({
  front: AxleBrake,
  rear: AxleBrake,
  pads: z.enum(['organic', 'semi-metallic', 'ceramic', 'race']),
  /** Bremskraftverteilung, Anteil Vorderachse. */
  bias: bounded(0.4, 0.85),
  quality: Quality,
});
export type Brakes = z.infer<typeof Brakes>;

// ---------- Aerodynamik ----------

export const Aero = z.object({
  /** Abtriebselemente vorn/hinten (Splitter, Flügel): 0 = keine. */
  frontDownforce: slider(),
  rearDownforce: slider(),
  undertray: z.enum(['none', 'partial', 'full']),
  /** Kühlluftöffnungen: mehr Kühlung, mehr Luftwiderstand. */
  cooling: slider(),
});
export type Aero = z.infer<typeof Aero>;

// ---------- Lack ----------

export const Finish = z.enum(['solid', 'metallic', 'pearl', 'matte', 'satin', 'chrome']);
export type Finish = z.infer<typeof Finish>;

export const PaintLayer = z.object({
  color: Color,
  finish: Finish,
  /** Flake-Anteil für Metallic/Perleffekt. */
  flake: slider(),
  /** Zweitfarbe des Perleffekts (Farbflop). */
  pearlColor: Color.optional(),
  clearcoat: slider(),
});
export type PaintLayer = z.infer<typeof PaintLayer>;

export const PaintZone = z.enum(['roof', 'hood', 'lower', 'mirrors', 'trim']);

export const Decal = z.object({
  id: Id,
  kind: z.enum(['stripe', 'number', 'text']),
  text: z.string().max(24).optional(),
  color: Color,
  side: z.enum(['left', 'right', 'both', 'top']),
  u: slider(),
  v: slider(),
  scale: bounded(0.02, 1),
});

export const Paint = z.object({
  base: PaintLayer,
  zones: z.array(z.object({ zone: PaintZone, layer: PaintLayer })).max(PaintZone.options.length),
  /** Folierung ersetzt die Lackoptik vollständig. */
  wrap: PaintLayer.optional(),
  decals: z.array(Decal).max(24),
});
export type Paint = z.infer<typeof Paint>;

// ---------- Auto ----------

const CarObject = z.object({
  schemaVersion: z.literal(CAR_SCHEMA_VERSION),
  kind: z.literal('car'),
  id: z.uuid(),
  meta: Meta,
  model: Model,
  engine: CarEngine,
  trim: Trim,
  drivetrain: Drivetrain,
  suspension: Suspension,
  wheels: Wheels,
  brakes: Brakes,
  aero: Aero,
  paint: Paint,
});

export const Car = CarObject.superRefine((c, ctx) => {
  const d = c.model.dimensions;
  if (d.overhangFront + d.wheelbase > d.length - 0.3) {
    ctx.addIssue({
      code: 'custom',
      path: ['model', 'dimensions', 'wheelbase'],
      message: 'Radstand plus vorderer Überhang lässt keinen hinteren Überhang (mind. 0,3 m)',
    });
  }
  if (c.drivetrain.gearbox === 'cvt' ? c.drivetrain.ratios.length !== 2 : false) {
    ctx.addIssue({
      code: 'custom',
      path: ['drivetrain', 'ratios'],
      message: 'CVT: genau [größte, kleinste] Übersetzung',
    });
  }
  for (let i = 1; i < c.drivetrain.ratios.length; i++) {
    if (c.drivetrain.ratios[i]! >= c.drivetrain.ratios[i - 1]!) {
      ctx.addIssue({
        code: 'custom',
        path: ['drivetrain', 'ratios', i],
        message: 'Gänge müssen absteigend übersetzt sein',
      });
      break;
    }
  }
});
export type Car = z.infer<typeof CarObject>;
