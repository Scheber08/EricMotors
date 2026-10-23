import type { Car } from '@ericmotors/schema';
import { type EngineAnalysis, analyzeEngineVariant } from '../engine/analyze';
import type { Warning } from '../engine/properties';
import { type AeroProperties, aeroProperties } from './aero';
import { type CarCostBreakdown, annualRunningCost, carCost } from './cost';
import { type CarGeometry, carGeometry } from './geometry';
import { type MassProperties, massProperties } from './mass';
import { type Performance, computePerformance } from './performance';
import { type CarRatings, carRatings, carWarnings } from './ratings';
import { type TireProperties, tireProperties } from './tires';

export interface CarAnalysis {
  geometry: CarGeometry;
  engine: EngineAnalysis;
  mass: MassProperties;
  aero: AeroProperties;
  tires: TireProperties;
  performance: Performance;
  ratings: CarRatings;
  cost: CarCostBreakdown;
  /** Unterhaltskosten pro Jahr (15 000 km), €. */
  runningCost: number;
  /** Warnungen von Motor und Auto, nach Schwere sortiert. */
  warnings: Warning[];
}

const SEVERITY = { error: 0, warning: 1, info: 2 } as const;

/** Alle abgeleiteten Werte eines Autos. Reine Funktion, läuft im Web Worker. */
export function analyzeCar(car: Car): CarAnalysis {
  const engine = analyzeEngineVariant({ family: car.engine.family, variant: car.engine.variant });
  const geometry = carGeometry(car);
  const mass = massProperties(car, geometry, engine);
  const aero = aeroProperties(car, geometry);
  const tires = tireProperties(car);
  const performance = computePerformance({ car, geometry, mass, aero, tires, engine });
  const ctx = { car, geometry, mass, tires, engine, performance };
  const ratings = carRatings(ctx);
  const cost = carCost(car, geometry, engine.cost);
  const warnings = [
    ...engine.warnings.map((w) => ({ ...w, path: `engine.${w.path}` })),
    ...carWarnings(ctx),
  ].sort((a, b) => SEVERITY[a.severity] - SEVERITY[b.severity]);
  return {
    geometry,
    engine,
    mass,
    aero,
    tires,
    performance,
    ratings,
    cost,
    runningCost: annualRunningCost(
      car,
      cost.total,
      ratings.reliability,
      performance.fuelPerDistance,
    ),
    warnings,
  };
}
