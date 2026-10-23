import { z } from 'zod';
import { Color, Id, MaterialId, Transform, angle, bounded, fraction, length } from '../primitives';

export const BodyShape = z.enum([
  'coupe',
  'sedan',
  'wagon',
  'suv',
  'roadster',
  'pickup',
  'formula',
  'prototype',
]);
export type BodyShape = z.infer<typeof BodyShape>;

/**
 * Hauptabmessungen in m. Der hintere Überhang ist abgeleitet:
 * overhangRear = length − overhangFront − wheelbase.
 */
export const BodyDimensions = z.object({
  length: length(2, 8),
  width: length(1, 2.6),
  height: length(0.7, 2.5),
  wheelbase: length(1.5, 5),
  trackFront: length(0.9, 2.2),
  trackRear: length(0.9, 2.2),
  overhangFront: length(0, 2),
  groundClearance: length(0.02, 0.5),
});
export type BodyDimensions = z.infer<typeof BodyDimensions>;

/**
 * Seitenprofil- und Querschnitts-Kontrollpunkte. Höhen relativ zur Gesamthöhe (0..1),
 * Längspositionen relativ zur Fahrzeuglänge (0 = Front, 1 = Heck).
 */
export const BodyProfile = z.object({
  noseHeight: fraction(),
  hoodHeight: fraction(),
  /** Längsposition des Windschutzscheibenfußes. */
  cowlPosition: fraction(),
  /** Neigung der Windschutzscheibe gegen die Horizontale, rad. */
  windshieldAngle: angle(0.25, 1.4),
  /** Länge des Dachs als Anteil der Fahrzeuglänge (0 bei Roadster/Formel). */
  roofLength: fraction(),
  /** Neigung der Heckscheibe gegen die Horizontale, rad. */
  rearWindowAngle: angle(0.2, 1.57),
  deckHeight: fraction(),
  tailHeight: fraction(),
  /** Höhe der Gürtellinie (Unterkante Seitenfenster). */
  beltlineHeight: fraction(),
  /** Einzug der Dachpartie gegenüber der Schulter, rad. */
  tumblehome: angle(0, 0.6),
  /** Verjüngung der Front bzw. des Hecks in der Draufsicht (Anteil der Breite). */
  frontTaper: bounded(0, 0.4),
  rearTaper: bounded(0, 0.4),
  /** Radhausausschnitt: Spiel zwischen Reifen und Radlauf, m. */
  wheelArchClearance: length(0, 0.15),
  /** Kotflügelverbreiterung je Seite, m. */
  wheelArchFlare: length(0, 0.15),
});
export type BodyProfile = z.infer<typeof BodyProfile>;

export const PanelZone = z.enum([
  'roof',
  'hood',
  'trunk',
  'doors',
  'fenders',
  'quarter-panels',
  'bumper-front',
  'bumper-rear',
  'floor',
]);
export type PanelZone = z.infer<typeof PanelZone>;

/** Außenhaut-Panel: Fläche wird aus der Geometrie berechnet, Masse = Fläche · Wandstärke · Dichte. */
export const Panel = z.object({
  zone: PanelZone,
  material: MaterialId,
  thickness: length(0.0003, 0.01),
});
export type Panel = z.infer<typeof Panel>;

export const PaintFinish = z.enum(['solid', 'metallic', 'pearl', 'matte', 'satin', 'chrome']);
export type PaintFinish = z.infer<typeof PaintFinish>;

export const PaintLayer = z.object({
  color: Color,
  finish: PaintFinish,
  /** Flake-Anteil für Metallic/Perleffekt. */
  flake: fraction(),
  /** Zweitfarbe des Perleffekts (Farbflop). */
  pearlColor: Color.optional(),
  /** Klarlack-Glanz. */
  clearcoat: fraction(),
});
export type PaintLayer = z.infer<typeof PaintLayer>;

export const Decal = z.object({
  id: Id,
  kind: z.enum(['stripe', 'number', 'text']),
  text: z.string().max(24).optional(),
  color: Color,
  /** Position auf der Karosserie: Seite und relative Längs-/Höhenlage. */
  side: z.enum(['left', 'right', 'top', 'both']),
  u: fraction(),
  v: fraction(),
  scale: bounded(0.01, 2),
});
export type Decal = z.infer<typeof Decal>;

export const Paint = z.object({
  base: PaintLayer,
  /** Mehrfarb-Zonen überschreiben die Basis für einzelne Panels. */
  zones: z.array(z.object({ zone: PanelZone, layer: PaintLayer })).max(16),
  /** Folierung ersetzt die Lackoptik vollständig (Masse vernachlässigbar). */
  wrap: PaintLayer.optional(),
  decals: z.array(Decal).max(32),
});
export type Paint = z.infer<typeof Paint>;

export const WheelDesign = z.enum([
  'five-spoke',
  'multi-spoke',
  'mesh',
  'monoblock',
  'aero-disc',
  'steel',
]);

export const WheelSpec = z.object({
  /** Felgendurchmesser (Sitzdurchmesser), m. 17″ = 0.4318 m. */
  rimDiameter: length(0.25, 0.6),
  /** Maulweite, m. */
  rimWidth: length(0.1, 0.4),
  /** Einpresstiefe ET, m (positiv: Anlage nach außen versetzt). */
  offset: length(-0.1, 0.1),
  boltCount: z.number().int().min(3).max(10),
  /** Lochkreisdurchmesser, m. */
  pitchCircleDiameter: length(0.08, 0.25),
  design: WheelDesign,
  material: MaterialId,
  massOverride: bounded(1, 60).optional(),
  /** Polares Trägheitsmoment um die Radachse, kg·m². */
  inertiaOverride: bounded(0.05, 5).optional(),
});
export type WheelSpec = z.infer<typeof WheelSpec>;

export const InteriorItem = z.object({
  id: Id,
  kind: z.enum([
    'seat',
    'cage',
    'insulation',
    'dashboard',
    'trim',
    'infotainment',
    'carpet',
    'other',
  ]),
  label: z.string().max(80).optional(),
  transform: Transform,
  /** Masse in kg ist hier Eingabe, da nicht aus Geometrie ableitbar. */
  mass: bounded(0, 500),
  material: MaterialId.optional(),
});
export type InteriorItem = z.infer<typeof InteriorItem>;

export const Body = z.object({
  shape: BodyShape,
  dimensions: BodyDimensions,
  profile: BodyProfile,
  panels: z.array(Panel).max(PanelZone.options.length),
  paint: Paint,
  wheels: z.object({ front: WheelSpec, rear: WheelSpec }),
  interior: z.array(InteriorItem).max(64),
  /** Baukasten-Anbauteile (Phase 7). */
  attachments: z
    .array(z.object({ id: Id, part: z.string().max(64), anchor: z.string().max(64) }))
    .max(64),
});
export type Body = z.infer<typeof Body>;
