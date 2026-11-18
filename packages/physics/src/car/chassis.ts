import type { Car } from '@ericmotors/schema';

/**
 * Torsionssteifigkeit der Karosserie über ein einfaches Ersatzmodell (spielnah):
 *   c_T = c_Bauart · f_Werkstoff · f_Form · (2,7 m / Radstand) · (1 + 0,05 · Qualität)
 * Richtwerte: moderne Limousine (Monocoque Stahl) ≈ 25 kN·m/°, Roadster ≈ 12–15, Leiterrahmen ≈ 8,
 * CFK-Monocoque ≈ 40+ (vgl. veröffentlichte Herstellerwerte).
 */
const DEG = Math.PI / 180;

export function torsionalStiffness(car: Car): number {
  const base = { monocoque: 25e3, spaceframe: 18e3, ladder: 8e3 }[car.model.chassis];
  const material = { steel: 1, 'galvanised-steel': 1, aluminium: 1.1, cfrp: 1.6 }[
    car.model.chassisMaterial
  ];
  const shape = {
    roadster: 0.55,
    van: 0.85,
    wagon: 0.9,
    pickup: 0.8,
    hatchback: 1,
    sedan: 1,
    coupe: 1.05,
    suv: 1,
  }[car.model.shape];
  const length = 2.7 / car.model.dimensions.wheelbase;
  // N·m pro Grad → N·m/rad
  return (base * material * shape * length * (1 + 0.05 * car.model.quality)) / DEG;
}

/** Steifigkeit normiert auf 0..1 (8 → 0, 45 kN·m/° → 1) für Handling, Komfort und Sicherheit. */
export function stiffnessIndex(stiffness: number): number {
  const kNmPerDeg = (stiffness * DEG) / 1000;
  return Math.min(1, Math.max(0, (kNmPerDeg - 8) / 37));
}
