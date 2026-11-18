import type { Car } from '@ericmotors/schema';
import { batteryChargePower, batteryMaxPower } from '../electric/battery';
import { unitPeakPower } from '../electric/motor';
import { type EngineAnalysis, analyzeEngineVariant } from '../engine/analyze';
import type { Warning } from '../engine/properties';
import { type AeroProperties, aeroProperties } from './aero';
import { torsionalStiffness } from './chassis';
import { type CarCostBreakdown, annualRunningCost, carCost } from './cost';
import { type CarGeometry, carGeometry } from './geometry';
import { type MassProperties, massProperties } from './mass';
import { type Performance, computePerformance } from './performance';
import { type CarRatings, carRatings, carWarnings } from './ratings';
import { type TireProperties, tireProperties } from './tires';

/** Zusammenfassung des Antriebs unabhängig von der Antriebsart. */
export interface PowertrainSummary {
  type: Car['powertrain']['type'];
  /** Spitzenleistung des Gesamtsystems an den Antriebswellen (inkl. Batteriegrenze), W. */
  systemPower: number;
  /** Spitzenleistung des Verbrenners, W (0 beim Elektroauto). */
  enginePower: number;
  /** Summe der E-Motor-Spitzenleistungen, W. */
  electricPower: number;
  /** Batterie: nutzbare Energie (J), maximale Entlade- und Ladeleistung (W). */
  batteryEnergy: number | null;
  batteryPower: number | null;
  chargePower: number | null;
}

export interface CarAnalysis {
  geometry: CarGeometry;
  /** Verbrenner-Analyse (bei Verbrenner und Hybrid). */
  engine: EngineAnalysis | undefined;
  powertrain: PowertrainSummary;
  /** Torsionssteifigkeit der Karosserie, N·m/rad. */
  torsionalStiffness: number;
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
  const pt = car.powertrain;
  const engine = pt.engine
    ? analyzeEngineVariant({ family: pt.engine.family, variant: pt.engine.variant })
    : undefined;
  const geometry = carGeometry(car);
  const mass = massProperties(car, geometry, engine);
  const aero = aeroProperties(car, geometry);
  const tires = tireProperties(car);
  const stiffness = torsionalStiffness(car);
  const performance = computePerformance({ car, geometry, mass, aero, tires, engine, stiffness });
  const powertrain: PowertrainSummary = {
    type: pt.type,
    systemPower: performance.systemPower,
    enginePower: engine?.curve.peakPower.power ?? 0,
    electricPower: pt.motors.reduce((a, m) => a + unitPeakPower(m), 0),
    batteryEnergy: pt.battery?.capacity ?? null,
    batteryPower: pt.battery ? batteryMaxPower(pt.battery) : null,
    // Ladeanschluss nur beim Elektroauto und Plug-in-Hybrid.
    chargePower:
      pt.battery && (pt.type === 'electric' || pt.hybrid?.plugIn)
        ? batteryChargePower(pt.battery)
        : null,
  };
  const ctx = { car, geometry, mass, tires, engine, performance, powertrain, stiffness };
  const ratings = carRatings(ctx);
  const cost = carCost(car, geometry, engine?.cost ?? 0);
  const warnings = [
    ...(engine?.warnings ?? []).map((w) => ({ ...w, path: `powertrain.engine.${w.path}` })),
    ...carWarnings(ctx),
  ].sort((a, b) => SEVERITY[a.severity] - SEVERITY[b.severity]);
  return {
    geometry,
    engine,
    powertrain,
    torsionalStiffness: stiffness,
    mass,
    aero,
    tires,
    performance,
    ratings,
    cost,
    runningCost: annualRunningCost(car, cost.total, ratings.reliability, performance),
    warnings,
  };
}
