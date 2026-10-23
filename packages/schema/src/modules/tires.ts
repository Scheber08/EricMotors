import { z } from 'zod';
import { bounded, length } from '../primitives';

/**
 * Pacejka Magic Formula (MF 5.2) – Teilsatz der Koeffizienten für Längs- und Querkraft.
 * Fehlende Koeffizienten werden aus dem Mischungs-Preset ergänzt (Phase 6).
 */
export const PacejkaCoefficients = z.record(
  z.string().regex(/^[pqr][A-Z]{1,2}[xyz]?\d?$/),
  bounded(-100, 100),
);

export const AxleTire = z.object({
  /** Nennbreite, m (225 mm = 0.225). Felgendurchmesser kommt aus `body.wheels`. */
  width: length(0.1, 0.45),
  /** Querschnittsverhältnis H/B. */
  aspectRatio: bounded(0.2, 0.9),
  construction: z.enum(['radial', 'bias']),
  compound: z.enum(['eco', 'touring', 'sport', 'semi-slick', 'slick', 'winter']),
  /** Reifenfülldruck (Überdruck), Pa. */
  pressure: bounded(80_000, 400_000),
  /** Rollwiderstandsbeiwert; ohne Angabe aus der Mischung. */
  rollingResistance: bounded(0.004, 0.03).optional(),
  pacejka: PacejkaCoefficients.optional(),
});
export type AxleTire = z.infer<typeof AxleTire>;

export const Tires = z.object({ front: AxleTire, rear: AxleTire });
export type Tires = z.infer<typeof Tires>;
