import type { Car } from '@ericmotors/schema';

/**
 * Abgeleitete Geometrie. Koordinaten nach ISO 8855: Ursprung Mitte Vorderachse auf Fahrbahn,
 * x nach vorn, z nach oben. Die Hinterachse liegt bei x = −Radstand.
 */
export interface CarGeometry {
  length: number;
  width: number;
  height: number;
  wheelbase: number;
  overhangFront: number;
  overhangRear: number;
  trackFront: number;
  trackRear: number;
  rideHeight: number;
  /** Hüllvolumen L · B · H, m³ – Bezugsgröße für Karosseriemassen und -kosten. */
  volume: number;
  /** Höhe der Motorhaube über der Fahrbahn, m. */
  hoodHeight: number;
  /** Tankvolumen, m³ (aus der Fahrzeuggröße abgeleitet). */
  tankVolume: number;
}

export function carGeometry(car: Car): CarGeometry {
  const d = car.model.dimensions;
  const shapeTank = {
    pickup: 1.3,
    suv: 1.15,
    van: 1.15,
    roadster: 0.85,
    coupe: 1,
    sedan: 1,
    wagon: 1,
    hatchback: 0.95,
  }[car.model.shape];
  return {
    length: d.length,
    width: d.width,
    height: d.height,
    wheelbase: d.wheelbase,
    overhangFront: d.overhangFront,
    overhangRear: d.length - d.wheelbase - d.overhangFront,
    trackFront: d.trackFront * d.width,
    trackRear: d.trackRear * d.width,
    rideHeight: car.suspension.rideHeight,
    volume: d.length * d.width * d.height,
    hoodHeight: d.height * (0.5 + 0.25 * car.model.morph.hoodHeight),
    tankVolume: (35 + 7 * (d.length - 3.5)) * shapeTank * 1e-3,
  };
}

/** Rad: Außendurchmesser aus Felge + 2 · Flankenhöhe, m. */
export const tireDiameter = (rim: number, width: number, aspectRatio: number) =>
  rim + 2 * width * aspectRatio;
