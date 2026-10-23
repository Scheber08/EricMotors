import { z } from 'zod';

/** Grundtypen. Alle physikalischen Größen in SI-Einheiten. */

/** Endliche Zahl mit Unter- und Obergrenze (inklusive). */
export const bounded = (min: number, max: number) => z.number().finite().min(min).max(max);

/** Regler 0..1 (Anzeige 0–100 %). */
export const slider = () => bounded(0, 1);

/** Qualitätsregler wie in Automation: −5 (billig) … +5 (hochwertig). */
export const Quality = z.number().int().min(-5).max(5);
export type Quality = z.infer<typeof Quality>;

export const Id = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9_-]+$/, 'nur Buchstaben, Ziffern, _ und -');

/** Farbe als #rrggbb. */
export const Color = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/** Metadaten für Autos und Motoren. */
export const Meta = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(4_000),
  tags: z.array(z.string().min(1).max(24)).max(10),
  /** Herkunft bei übernommenen Entwürfen („Fork“). */
  forkOf: z
    .object({ id: z.string().max(64), ownerName: z.string().max(80), title: z.string().max(80) })
    .optional(),
});
export type Meta = z.infer<typeof Meta>;
