import { z } from 'zod';
import { Vec3, bounded, fraction, length } from '../primitives';

/** Dämpferkennlinie als Stützstellen [Kolbengeschwindigkeit m/s, Kraft N]. */
export const DamperCurve = z
  .array(z.tuple([bounded(0, 5), bounded(0, 50_000)]))
  .min(2)
  .max(12);

export const AxleSuspension = z.object({
  kind: z.enum([
    'macpherson',
    'double-wishbone',
    'multi-link',
    'solid-axle',
    'twist-beam',
    'pushrod',
    'pullrod',
  ]),
  /** Anlenkpunkte (linke Fahrzeugseite) in Fahrzeugkoordinaten, m. Phase 5. */
  hardpoints: z.record(z.string().max(32), Vec3),
  /** Federrate am Federbein, N/m, und Übersetzung Rad → Feder. */
  springRate: bounded(5_000, 500_000),
  motionRatio: bounded(0.3, 1.5),
  damper: z.object({ bump: DamperCurve, rebound: DamperCurve, motionRatio: bounded(0.3, 1.5) }),
  /** Stabilisator-Drehsteifigkeit bezogen auf Radhub, N·m/rad. */
  antiRollBar: bounded(0, 200_000),
  bumpStopGap: length(0, 0.15),
  /** Statischer Sturz und Spur, rad. */
  staticCamber: bounded(-0.1, 0.05),
  staticToe: bounded(-0.02, 0.02),
  /** Federweg Einfedern/Ausfedern, m. */
  travelBump: length(0.01, 0.4),
  travelRebound: length(0.01, 0.4),
});
export type AxleSuspension = z.infer<typeof AxleSuspension>;

export const Steering = z.object({
  /** Lenkübersetzung Lenkrad : Radlenkwinkel in Mittelstellung. */
  ratio: bounded(5, 25),
  /** Variable Übersetzung am Anschlag (gleich `ratio` bei konstanter Übersetzung). */
  ratioAtLock: bounded(5, 25),
  /** Ackermann-Anteil (0 = parallel, 1 = voller Ackermann). */
  ackermann: bounded(-0.5, 1.5),
  assist: z.enum(['none', 'hydraulic', 'electro-hydraulic', 'electric']),
  /** Lenkradumdrehungen von Anschlag zu Anschlag. */
  turnsLockToLock: bounded(1, 5),
  rearSteer: fraction(),
});
export type Steering = z.infer<typeof Steering>;

export const Suspension = z.object({
  front: AxleSuspension,
  rear: AxleSuspension,
  steering: Steering,
});
export type Suspension = z.infer<typeof Suspension>;
