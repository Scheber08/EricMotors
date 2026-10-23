import { z } from 'zod';
import { Id, Transform, bounded, fraction } from '../primitives';

export const DifferentialKind = z.enum([
  'open',
  'plate-lsd',
  'torsen',
  'viscous',
  'active',
  'locked',
]);

export const Differential = z.object({
  id: Id,
  position: z.enum(['front', 'center', 'rear']),
  kind: DifferentialKind,
  /** Sperrwert Zug/Schub als Anteil (0 = offen, 1 = gesperrt) bzw. Torque Bias Ratio − 1 bei Torsen. */
  lockingDrive: fraction(),
  lockingCoast: fraction(),
  /** Vorspannmoment, N·m. */
  preload: bounded(0, 1_000),
  torqueVectoring: z.boolean(),
});
export type Differential = z.infer<typeof Differential>;

export const Gearbox = z.object({
  id: Id,
  kind: z.enum(['manual', 'dct', 'automatic', 'cvt', 'single-speed', 'sequential']),
  /** Übersetzungen der Vorwärtsgänge (Eingang/Ausgang), absteigend. */
  ratios: z.array(bounded(0.3, 8)).min(1).max(12),
  reverseRatio: bounded(1, 8),
  /** CVT: Übersetzungsspreizung (nur bei kind = 'cvt'). */
  cvtRange: z.object({ min: bounded(0.3, 2), max: bounded(1, 5) }).optional(),
  /** Achsübersetzung (Achsantrieb). */
  finalDrive: bounded(1, 12),
  /** Mechanischer Wirkungsgrad je Gang (Zahneingriff + Lager), dimensionslos. */
  efficiency: bounded(0.7, 0.995),
  finalDriveEfficiency: bounded(0.85, 0.995),
  /** Massenträgheit getriebeeingangsseitig, kg·m². */
  inputInertia: bounded(0, 1),
  /** Schaltzeit (Zugkraftunterbrechung), s. */
  shiftTime: bounded(0, 2),
  torqueConverter: z
    .object({
      /** Kapazitätsfaktor K = n / √T, (rad/s)/√(N·m). */
      capacityFactor: bounded(5, 40),
      stallTorqueRatio: bounded(1, 3.5),
      lockup: z.boolean(),
    })
    .optional(),
  /** Maximal übertragbares Eingangsmoment, N·m. */
  maxInputTorque: bounded(50, 5_000),
  transform: Transform,
});
export type Gearbox = z.infer<typeof Gearbox>;

export const Clutch = z.object({
  id: Id,
  kind: z.enum(['single-plate', 'twin-plate', 'multi-plate-wet', 'none']),
  /** Übertragbares Moment, N·m. */
  torqueCapacity: bounded(0, 5_000),
  flywheelInertia: bounded(0, 1),
});
export type Clutch = z.infer<typeof Clutch>;

export const Drivetrain = z.object({
  layout: z.enum(['fwd', 'rwd', 'awd']),
  /** Statische Momentenverteilung an die Vorderachse bei AWD (0..1). */
  frontTorqueShare: fraction(),
  clutch: Clutch,
  gearbox: Gearbox,
  differentials: z.array(Differential).min(1).max(3),
});
export type Drivetrain = z.infer<typeof Drivetrain>;
