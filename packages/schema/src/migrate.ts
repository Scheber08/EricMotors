import { SCHEMA_VERSION, Vehicle } from './vehicle';

/**
 * Migrationen: Schritt n hebt ein Dokument von Version n auf n + 1.
 * Jede Migration ist eine reine Funktion auf unvalidierten Rohdaten.
 */
type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

export const MIGRATIONS: Record<number, Migration> = {
  // 1: (raw) => ({ ...raw, schemaVersion: 2, neuesFeld: standardwert }),
};

export class SchemaVersionError extends Error {}

/** Hebt beliebige gespeicherte Fahrzeugdaten auf die aktuelle Version und validiert sie. */
export function migrateVehicle(input: unknown): Vehicle {
  if (typeof input !== 'object' || input === null) throw new SchemaVersionError('kein Objekt');
  let raw = input as Record<string, unknown>;
  let version = raw.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new SchemaVersionError('schemaVersion fehlt oder ist ungültig');
  }
  if (version > SCHEMA_VERSION) {
    throw new SchemaVersionError(
      `Fahrzeug stammt aus einer neueren Version (${version} > ${SCHEMA_VERSION})`,
    );
  }
  while (version < SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) throw new SchemaVersionError(`keine Migration von Version ${version}`);
    raw = step(raw);
    version += 1;
  }
  return Vehicle.parse(raw);
}
