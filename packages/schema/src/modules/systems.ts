import { z } from 'zod';
import { MaterialId, Transform, bounded, length } from '../primitives';

export const Systems = z.object({
  cooling: z.object({
    /** Netzfläche des Kühlers, m², und Blocktiefe, m. */
    radiatorArea: bounded(0.05, 1.5),
    radiatorDepth: length(0.01, 0.1),
    /** Luftführung: Anteil der Stirnfläche, der durch den Kühler strömt (Kühlluftverlust). */
    ductEfficiency: bounded(0.2, 1),
    fanPower: bounded(0, 3_000),
    transform: Transform,
  }),
  exhaust: z.object({
    layout: z.enum(['single', 'dual', 'center']),
    pipeDiameter: length(0.03, 0.12),
    material: MaterialId,
    catalysts: z.number().int().min(0).max(4),
    particulateFilter: z.boolean(),
    mufflers: z.number().int().min(0).max(4),
  }),
  electrical: z.object({
    /** 12-V-/48-V-Bordnetz. */
    voltage: z.enum(['12V', '48V']),
    /** Grundlast der Verbraucher, W. */
    baseLoad: bounded(0, 5_000),
    auxBatteryCapacityAh: bounded(0, 200),
  }),
  hvac: z.object({
    installed: z.boolean(),
    /** Kompressor-Antriebsleistung bei Volllast, W. */
    compressorPower: bounded(0, 6_000),
  }),
});
export type Systems = z.infer<typeof Systems>;
