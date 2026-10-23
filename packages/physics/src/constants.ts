/** Physikalische Konstanten und Stoffwerte (SI). Siehe docs/MODELS.md § Konstanten. */

/** Normfallbeschleunigung, m/s². */
export const G = 9.80665;
/** Umgebungsdruck (ISO-Normatmosphäre), Pa. */
export const P_AMBIENT = 101_325;
/** Umgebungstemperatur, K (25 °C). */
export const T_AMBIENT = 298.15;
/** Spezifische Gaskonstante Luft, J/(kg·K). */
export const R_AIR = 287.05;
/** Isentropenexponent Luft. */
export const GAMMA_AIR = 1.4;
/** Luftdichte bei Umgebungsbedingungen, kg/m³. */
export const RHO_AIR = P_AMBIENT / (R_AIR * T_AMBIENT);

export interface FuelData {
  /** Unterer Heizwert, J/kg. */
  lhv: number;
  /** Stöchiometrisches Luft-Kraftstoff-Verhältnis (Masse). */
  afrStoich: number;
  /** Dichte, kg/m³. */
  density: number;
  /** Klopffestigkeit: höchste klopffreie Verdichtung bei Saugbetrieb (spielnahe Kenngröße). */
  knockLimitCr: number;
  /** CO₂-Emission bei vollständiger Verbrennung, kg CO₂ je kg Kraftstoff. */
  co2PerKg: number;
  /** Preis, €/l (Richtwert Deutschland). */
  pricePerLiter: number;
}

/**
 * Kraftstoffdaten. Heizwerte/AFR nach Heywood (1988), Anhang D; CO₂-Faktoren nach
 * Kohlenstoffanteil. Klopfgrenzen sind spielnahe Kalibrierwerte (ROZ 91/95/98, E85).
 */
export const FUELS = {
  regular: {
    lhv: 43.0e6,
    afrStoich: 14.6,
    density: 745,
    knockLimitCr: 10.6,
    co2PerKg: 3.15,
    pricePerLiter: 1.75,
  },
  premium: {
    lhv: 42.9e6,
    afrStoich: 14.6,
    density: 748,
    knockLimitCr: 11.5,
    co2PerKg: 3.15,
    pricePerLiter: 1.8,
  },
  super: {
    lhv: 42.8e6,
    afrStoich: 14.5,
    density: 750,
    knockLimitCr: 12.3,
    co2PerKg: 3.15,
    pricePerLiter: 1.9,
  },
  e85: {
    lhv: 29.2e6,
    afrStoich: 9.8,
    density: 785,
    knockLimitCr: 14.5,
    co2PerKg: 2.03,
    pricePerLiter: 1.1,
  },
  diesel: {
    lhv: 42.8e6,
    afrStoich: 14.5,
    density: 835,
    knockLimitCr: Infinity,
    co2PerKg: 3.17,
    pricePerLiter: 1.7,
  },
} as const satisfies Record<string, FuelData>;
