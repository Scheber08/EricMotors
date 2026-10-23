import { z } from 'zod';
import { Id } from './primitives';
import { Aero } from './modules/aero';
import { Body } from './modules/body';
import { Brakes } from './modules/brakes';
import { Chassis } from './modules/chassis';
import { Drivetrain } from './modules/drivetrain';
import { Powertrain } from './modules/powertrain';
import { Suspension } from './modules/suspension';
import { Systems } from './modules/systems';
import { Tires } from './modules/tires';

/** Aktuelle Schemaversion. Bei jeder inkompatiblen Änderung erhöhen und Migration ergänzen. */
export const SCHEMA_VERSION = 1;

export const VehicleMeta = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(4_000),
  tags: z.array(z.string().min(1).max(24)).max(10),
  /** Herkunft bei übernommenen Fahrzeugen („Fork“). */
  forkOf: z
    .object({
      vehicleId: z.string().max(64),
      ownerName: z.string().max(80),
      title: z.string().max(80),
    })
    .optional(),
});
export type VehicleMeta = z.infer<typeof VehicleMeta>;

const VehicleObject = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: z.uuid(),
  meta: VehicleMeta,
  body: Body,
  chassis: Chassis,
  powertrain: Powertrain,
  drivetrain: Drivetrain,
  suspension: Suspension,
  brakes: Brakes,
  tires: Tires,
  aero: Aero,
  systems: Systems,
});

/**
 * Vollständiges Fahrzeug: einzige Quelle der Wahrheit. Enthält ausschließlich Eingabeparameter;
 * alle abgeleiteten Größen berechnet `@ericmotors/physics`.
 */
export const Vehicle = VehicleObject.superRefine((v, ctx) => {
  // Eindeutige IDs über alle referenzierbaren Bauteile.
  const ids = new Set<string>();
  const add = (id: string, path: (string | number)[]) => {
    if (ids.has(id)) ctx.addIssue({ code: 'custom', path, message: `doppelte Bauteil-ID „${id}“` });
    ids.add(id);
  };
  v.powertrain.components.forEach((c, i) => add(c.id, ['powertrain', 'components', i, 'id']));
  add(v.drivetrain.clutch.id, ['drivetrain', 'clutch', 'id']);
  add(v.drivetrain.gearbox.id, ['drivetrain', 'gearbox', 'id']);
  v.drivetrain.differentials.forEach((d, i) => add(d.id, ['drivetrain', 'differentials', i, 'id']));

  // Kanten im Antriebsgraph müssen auf existierende Bauteile zeigen.
  v.powertrain.connections.forEach((c, i) => {
    for (const end of ['from', 'to'] as const) {
      if (!ids.has(c[end])) {
        ctx.addIssue({
          code: 'custom',
          path: ['powertrain', 'connections', i, end],
          message: `unbekanntes Bauteil „${c[end]}“`,
        });
      }
    }
  });

  const d = v.body.dimensions;
  if (d.overhangFront + d.wheelbase > d.length) {
    ctx.addIssue({
      code: 'custom',
      path: ['body', 'dimensions', 'wheelbase'],
      message: 'Radstand plus vorderer Überhang übersteigt die Fahrzeuglänge',
    });
  }
  if (Math.max(d.trackFront, d.trackRear) > d.width) {
    ctx.addIssue({
      code: 'custom',
      path: ['body', 'dimensions', 'trackFront'],
      message: 'Spurweite größer als Fahrzeugbreite',
    });
  }
});
export type Vehicle = z.infer<typeof VehicleObject>;

export { Id };
