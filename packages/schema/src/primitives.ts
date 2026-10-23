import { z } from 'zod';

/**
 * Grundtypen des Fahrzeugschemas. Alle Größen in SI-Einheiten.
 * Koordinatensystem nach ISO 8855: Ursprung Mitte Vorderachse auf Fahrbahnhöhe,
 * x nach vorn, y nach links, z nach oben.
 */

/** Endliche Zahl mit Unter- und Obergrenze (inklusive). */
export const bounded = (min: number, max: number) => z.number().finite().min(min).max(max);

/** Länge in m. */
export const length = (min = 0, max = 20) => bounded(min, max);
/** Winkel in rad. */
export const angle = (min = -Math.PI, max = Math.PI) => bounded(min, max);
/** Verhältnis bzw. Anteil, dimensionslos. */
export const fraction = () => bounded(0, 1);

export const Id = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9_-]+$/, 'nur Buchstaben, Ziffern, _ und -');
export type Id = z.infer<typeof Id>;

export const Vec3 = z.tuple([bounded(-50, 50), bounded(-50, 50), bounded(-50, 50)]);
export type Vec3 = z.infer<typeof Vec3>;

/** Einheitsquaternion [x, y, z, w]. */
export const Quat = z
  .tuple([bounded(-1, 1), bounded(-1, 1), bounded(-1, 1), bounded(-1, 1)])
  .refine(([x, y, z, w]) => Math.abs(Math.hypot(x, y, z, w) - 1) < 1e-3, {
    message: 'Quaternion muss normiert sein',
  });
export type Quat = z.infer<typeof Quat>;

/** Symmetrischer Trägheitstensor in kg·m²: [Ixx, Iyy, Izz, Ixy, Ixz, Iyz]. */
export const Inertia = z.tuple([
  bounded(0, 1e5),
  bounded(0, 1e5),
  bounded(0, 1e5),
  bounded(-1e5, 1e5),
  bounded(-1e5, 1e5),
  bounded(-1e5, 1e5),
]);
export type Inertia = z.infer<typeof Inertia>;

export const Transform = z.object({
  /** Position des Bauteilursprungs relativ zum Fahrzeugursprung, m. */
  position: Vec3,
  rotation: Quat,
});
export type Transform = z.infer<typeof Transform>;

/** Achsparalleler Bauraum im lokalen Bauteilsystem, m. */
export const Envelope = z.object({ min: Vec3, max: Vec3 });
export type Envelope = z.infer<typeof Envelope>;

/** Farbe als #rrggbb. */
export const Color = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/**
 * Werkstoffe. Kennwerte (Dichte, E-Modul, Festigkeit) liegen in `@ericmotors/physics`,
 * damit das Schema reine Eingabe bleibt.
 */
export const MaterialId = z.enum([
  'steel-mild',
  'steel-hsla',
  'steel-forged',
  'stainless',
  'aluminium-sheet',
  'aluminium-cast',
  'aluminium-forged',
  'magnesium',
  'titanium',
  'cast-iron-grey',
  'cast-iron-cgi',
  'cfrp',
  'gfrp',
  'carbon-ceramic',
]);
export type MaterialId = z.infer<typeof MaterialId>;

/**
 * Gemeinsame Basis aller platzierbaren Bauteile.
 * Masse und Trägheit werden berechnet; die Overrides sind optionale Eingaben
 * (z. B. gewogene Masse) und haben dann Vorrang.
 */
export const componentBase = {
  id: Id,
  label: z.string().max(80).optional(),
  transform: Transform,
  massOverride: bounded(0, 50_000).optional(),
  inertiaOverride: Inertia.optional(),
};

export const IDENTITY_ROTATION: Quat = [0, 0, 0, 1];
