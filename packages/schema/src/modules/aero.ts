import { z } from 'zod';
import { Id, Vec3, angle, bounded, length } from '../primitives';

export const Wing = z.object({
  id: Id,
  position: Vec3,
  span: length(0.2, 2.5),
  chord: length(0.05, 0.6),
  /** NACA-4-Ziffern-Profil oder Preset. */
  profile: z.string().max(16),
  angleOfAttack: angle(-0.2, 0.5),
  elements: z.number().int().min(1).max(3),
});

export const Aero = z.object({
  mode: z.enum(['estimated', 'override']),
  /** Manuelle Werte, z. B. aus externer CFD oder Windkanal (bei mode = 'override'). */
  overrides: z
    .object({
      dragCoefficient: bounded(0.15, 1.5),
      frontalArea: bounded(0.5, 5),
      /** Auftriebsbeiwerte je Achse (negativ = Abtrieb), bezogen auf frontalArea. */
      liftCoefficientFront: bounded(-5, 1),
      liftCoefficientRear: bounded(-5, 1),
    })
    .partial(),
  /** Glatter Unterboden, Diffusor-Winkel, Kühlluftbedarf als Formparameter. */
  underbody: z.enum(['open', 'partial', 'flat']),
  diffuserAngle: angle(0, 0.35),
  wings: z.array(Wing).max(6),
});
export type Aero = z.infer<typeof Aero>;
