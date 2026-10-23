import type { Car } from '@ericmotors/schema';
import type { CarGeometry } from './geometry';

/**
 * Aerodynamik-Näherung (docs/MODELS.md § Aerodynamik). Grundwerte je Karosserieform nach
 * typischen Serienwerten (Hucho 2013), Zuschläge für Form-Regler und Anbauteile.
 */
export interface AeroProperties {
  dragCoefficient: number;
  /** Stirnfläche A ≈ 0,84 · B · H (Hucho 2013), m². */
  frontalArea: number;
  /** Auftriebsbeiwerte je Achse, bezogen auf A (negativ = Abtrieb). */
  liftFront: number;
  liftRear: number;
}

export function aeroProperties(car: Car, g: CarGeometry): AeroProperties {
  const { shape, morph } = car.model;
  const a = car.aero;
  const base = {
    coupe: 0.3,
    sedan: 0.29,
    wagon: 0.3,
    hatchback: 0.31,
    suv: 0.35,
    roadster: 0.34,
    pickup: 0.42,
    van: 0.34,
  }[shape];
  const tireWidth = (car.wheels.front.width + car.wheels.rear.width) / 2;
  const cd =
    base +
    0.025 -
    0.05 * morph.windshieldRake -
    0.02 * (morph.rearSlope - 0.5) +
    0.02 * (morph.noseHeight - 0.5) +
    0.015 * morph.archFlare +
    { none: 0.03, partial: 0, full: -0.015 }[a.undertray] +
    0.04 * a.cooling +
    0.04 * a.frontDownforce +
    0.07 * a.rearDownforce +
    0.05 * (car.suspension.rideHeight - 0.14) +
    0.01 * (tireWidth / 0.225 - 1);

  const underbody = { none: 0, partial: 0.02, full: 0.05 }[a.undertray];
  return {
    dragCoefficient: Math.max(0.2, cd),
    frontalArea: 0.84 * g.width * g.height,
    liftFront: 0.1 - 0.6 * a.frontDownforce - underbody,
    liftRear: 0.12 - 1.0 * a.rearDownforce - underbody,
  };
}
