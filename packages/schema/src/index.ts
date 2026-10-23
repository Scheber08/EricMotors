/**
 * Gemeinsames, versioniertes Fahrzeugschema für Frontend und Worker.
 * Alle Größen in SI-Einheiten, Koordinaten nach ISO 8855.
 */
export * from './primitives';
export * from './units';
export * from './vehicle';
export * from './migrate';
export * from './modules/body';
export * from './modules/chassis';
export * from './modules/powertrain';
export * from './modules/drivetrain';
export * from './modules/suspension';
export * from './modules/brakes';
export * from './modules/tires';
export * from './modules/aero';
export * from './modules/systems';
export * from './templates';
