import type { Engine } from '@ericmotors/schema';
import { FUELS } from '../constants';
import { type EngineCurve, type EngineInput, displacement } from './curve';
import { engineCurve } from './curve';
import {
  type EngineDimensions,
  type EngineRatings,
  type Warning,
  engineCost,
  engineDimensions,
  engineMass,
  engineRatings,
  engineWarnings,
} from './properties';

export interface EngineAnalysis {
  displacement: number;
  curve: EngineCurve;
  mass: number;
  dimensions: EngineDimensions;
  cost: number;
  ratings: EngineRatings;
  warnings: Warning[];
  /** Spezifische Leistung, W/m³. */
  specificPower: number;
  /** Leistungsgewicht des Motors, W/kg. */
  powerToMass: number;
  /** Bestwert des spezifischen Kraftstoffverbrauchs an der Volllast, kg/J. */
  bestBsfc: number;
}

/** Alle abgeleiteten Werte einer Motorvariante (Eingabe → Ausgabe, ohne Seiteneffekte). */
export function analyzeEngineVariant(input: EngineInput): EngineAnalysis {
  const curve = engineCurve(input);
  const vd = displacement(input.family, input.variant);
  const mass = engineMass(input);
  const lhv = FUELS[input.variant.fuel].lhv;
  const bestEta = Math.max(...curve.points.map((p) => p.efficiency));
  return {
    displacement: vd,
    curve,
    mass,
    dimensions: engineDimensions(input.family),
    cost: engineCost(input),
    ratings: engineRatings(input, curve),
    warnings: engineWarnings(input, curve),
    specificPower: curve.peakPower.power / vd,
    powerToMass: curve.peakPower.power / mass,
    bestBsfc: bestEta > 0 ? 1 / (bestEta * lhv) : Infinity,
  };
}

/** Analysiert eine Variante eines Bibliotheksmotors. */
export function analyzeEngine(engine: Engine, variantId: string): EngineAnalysis {
  const variant = engine.variants.find((v) => v.id === variantId);
  if (!variant) throw new Error(`Variante ${variantId} fehlt`);
  return analyzeEngineVariant({ family: engine.family, variant });
}
