import { z } from 'zod';
import { MaterialId, bounded, length } from '../primitives';

export const Chassis = z.object({
  construction: z.enum(['monocoque', 'spaceframe', 'ladder-frame', 'tub']),
  material: MaterialId,
  /** Ersatzquerschnitt der Schweller bzw. Längsträger (Hohlprofil), m. */
  sill: z.object({
    width: length(0.03, 0.4),
    height: length(0.03, 0.4),
    wall: length(0.0005, 0.01),
  }),
  /** Mitteltunnel als zusätzlicher Längsträger. */
  tunnel: z.object({ width: length(0, 0.4), height: length(0, 0.4), wall: length(0, 0.01) }),
  /** Querschnitt Rohrrahmen (nur Spaceframe), m. */
  tube: z.object({ diameter: length(0.01, 0.08), wall: length(0.0005, 0.005) }),
  /** Steifigkeitszuschlag durch eingeklebte Scheiben und Käfig (Faktor ≥ 1). */
  stiffeningFactor: bounded(1, 3),
});
export type Chassis = z.infer<typeof Chassis>;
