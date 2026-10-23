import { CAR_SCHEMA_VERSION, Car } from './car';
import { ENGINE_SCHEMA_VERSION, Engine } from './engine';

/**
 * Migrationen: Schritt n hebt ein Dokument von Version n auf n + 1.
 * Jede Migration ist eine reine Funktion auf unvalidierten Rohdaten.
 */
type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

export const CAR_MIGRATIONS: Record<number, Migration> = {
  // v1 → v2: Antrieb als Union (Verbrenner/Elektro/Hybrid); der bisherige Motor wird zum Verbrenner.
  1: ({ engine, ...rest }) => ({
    ...rest,
    schemaVersion: 2,
    powertrain: { type: 'ice', engine, motors: [] },
  }),
};
export const ENGINE_MIGRATIONS: Record<number, Migration> = {};

export class SchemaVersionError extends Error {}

function upgrade(input: unknown, current: number, migrations: Record<number, Migration>) {
  if (typeof input !== 'object' || input === null) throw new SchemaVersionError('kein Objekt');
  let raw = input as Record<string, unknown>;
  let version = raw.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new SchemaVersionError('schemaVersion fehlt oder ist ungültig');
  }
  if (version > current) {
    throw new SchemaVersionError(
      `Entwurf stammt aus einer neueren Version (${version} > ${current})`,
    );
  }
  while (version < current) {
    const step = migrations[version];
    if (!step) throw new SchemaVersionError(`keine Migration von Version ${version}`);
    raw = step(raw);
    version += 1;
  }
  return raw;
}

/** Hebt gespeicherte Autodaten auf die aktuelle Version und validiert sie. */
export function migrateCar(input: unknown): Car {
  return Car.parse(upgrade(input, CAR_SCHEMA_VERSION, CAR_MIGRATIONS));
}

/** Hebt gespeicherte Motordaten auf die aktuelle Version und validiert sie. */
export function migrateEngine(input: unknown): Engine {
  return Engine.parse(upgrade(input, ENGINE_SCHEMA_VERSION, ENGINE_MIGRATIONS));
}
