/**
 * Spielnahe, aber plausible Berechnungen für Motoren und Autos.
 * Reine Funktionen ohne Seiteneffekte, ausgeführt im Web Worker. Modelle: docs/MODELS.md.
 */
export * from './constants';
export * from './engine/curve';
export * from './engine/properties';
export * from './engine/analyze';
export * from './car/geometry';
export * from './car/mass';
export * from './car/aero';
export * from './car/tires';
export * from './car/performance';
export * from './car/cost';
export * from './car/ratings';
export * from './car/analyze';
export * from './car/drive';
export * from './car/chassis';
export * from './car/brakes';
export * from './car/consumption';
export * from './electric/motor';
export * from './electric/battery';
export * from './simulation';
export * from './testdrive/vehicle';
export * from './testdrive/track';
