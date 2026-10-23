import type { Car, TireType } from '@ericmotors/schema';
import { tireDiameter } from './geometry';

/**
 * Vereinfachtes Reifenmodell: Haftbeiwert je Mischung (Richtwerte trockener Asphalt),
 * leichter Breiteneinfluss, Rollwiderstandsbeiwert je Mischung (EU-Reifenlabel-Klassen).
 */
const GRIP: Record<TireType, number> = {
  eco: 0.85,
  touring: 0.95,
  sport: 1.05,
  'semi-slick': 1.2,
  slick: 1.35,
  'all-terrain': 0.85,
  offroad: 0.75,
};
const ROLLING: Record<TireType, number> = {
  eco: 0.0075,
  touring: 0.009,
  sport: 0.011,
  'semi-slick': 0.013,
  slick: 0.015,
  'all-terrain': 0.012,
  offroad: 0.016,
};

export interface AxleTireProperties {
  grip: number;
  rollingResistance: number;
  /** Dynamischer Rollradius ≈ 0,97 · statischer Radius, m. */
  radius: number;
}

export interface TireProperties {
  front: AxleTireProperties;
  rear: AxleTireProperties;
}

export function tireProperties(car: Car): TireProperties {
  const w = car.wheels;
  const axle = (t: Car['wheels']['front']): AxleTireProperties => ({
    grip: GRIP[w.tireType] * Math.pow(t.width / 0.225, 0.1) * (1 + 0.01 * w.quality),
    rollingResistance: ROLLING[w.tireType] * (1 - 0.01 * w.quality),
    radius: 0.97 * (tireDiameter(w.rimDiameter, t.width, t.aspectRatio) / 2),
  });
  return { front: axle(w.front), rear: axle(w.rear) };
}
