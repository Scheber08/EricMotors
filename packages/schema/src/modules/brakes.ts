import { z } from 'zod';
import { MaterialId, bounded, fraction, length } from '../primitives';

export const AxleBrake = z.object({
  kind: z.enum(['disc', 'drum']),
  /** Scheiben- bzw. Trommeldurchmesser, m. */
  diameter: length(0.18, 0.45),
  thickness: length(0.008, 0.045),
  ventilated: z.boolean(),
  material: MaterialId,
  /** Kolben je Sattel und Kolbendurchmesser, m. */
  pistonsPerCaliper: z.number().int().min(1).max(8),
  pistonDiameter: length(0.025, 0.06),
  /** Reibwert Belag/Scheibe. */
  padFriction: bounded(0.2, 0.7),
});
export type AxleBrake = z.infer<typeof AxleBrake>;

export const Brakes = z.object({
  front: AxleBrake,
  rear: AxleBrake,
  /** Bremskraftverteilung (Anteil Vorderachse), wird bei Hydraulik über Kolbenflächen erreicht. */
  bias: fraction(),
  abs: z.boolean(),
  masterCylinderDiameter: length(0.015, 0.035),
  pedalRatio: bounded(2, 8),
  /** Verstärkungsfaktor Bremskraftverstärker. */
  boosterGain: bounded(1, 10),
});
export type Brakes = z.infer<typeof Brakes>;
