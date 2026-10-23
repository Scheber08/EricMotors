/**
 * Einheiten: Intern wird ausschließlich in SI gerechnet und gespeichert.
 * Diese Umrechnungen dienen nur der Anzeige und Eingabe in der Oberfläche.
 *
 * Faktoren nach NIST SP 811 (2008), Appendix B, und DIN 66036 (metrische PS):
 * - 1 PS (metrisch)   = 735.49875 W        (75 kp·m/s, kp = 9.80665 N)
 * - 1 hp (mechanisch) = 745.69987158227022 W (550 ft·lbf/s)
 * - 1 lb  = 0.45359237 kg (exakt), 1 in = 0.0254 m (exakt), 1 mi = 1609.344 m (exakt)
 * - 1 lbf·ft = 1.3558179483314004 N·m, 1 psi = 6894.757293168361 Pa
 */

export type UnitSystem = 'metric' | 'imperial';
export type PowerUnit = 'kW' | 'PS' | 'hp';

/** Normfallbeschleunigung g_n (CGPM 1901), exakt. */
export const STANDARD_GRAVITY = 9.80665;
export const W_PER_PS = 735.49875;
export const KG_PER_LB = 0.45359237;
export const M_PER_IN = 0.0254;
export const M_PER_FT = 0.3048;
export const M_PER_MI = 1609.344;
/** 1 lbf = 1 lb · g_n */
export const N_PER_LBF = KG_PER_LB * STANDARD_GRAVITY;
export const W_PER_HP = 550 * M_PER_FT * N_PER_LBF;
export const NM_PER_LBFFT = M_PER_FT * N_PER_LBF;
export const PA_PER_PSI = N_PER_LBF / (M_PER_IN * M_PER_IN);
export const PA_PER_BAR = 1e5;

/** Leistung in W → Anzeigeeinheit. */
export function powerFromSI(watts: number, unit: PowerUnit): number {
  switch (unit) {
    case 'kW':
      return watts / 1000;
    case 'PS':
      return watts / W_PER_PS;
    case 'hp':
      return watts / W_PER_HP;
  }
}

/** Leistung in Anzeigeeinheit → W. */
export function powerToSI(value: number, unit: PowerUnit): number {
  switch (unit) {
    case 'kW':
      return value * 1000;
    case 'PS':
      return value * W_PER_PS;
    case 'hp':
      return value * W_PER_HP;
  }
}

/** Geschwindigkeit in m/s → km/h bzw. mph. */
export function speedFromSI(metersPerSecond: number, system: UnitSystem): number {
  return system === 'metric' ? metersPerSecond * 3.6 : (metersPerSecond * 3600) / M_PER_MI;
}

/** Drehzahl: Winkelgeschwindigkeit in rad/s → 1/min. */
export function radPerSecToRpm(omega: number): number {
  return (omega * 60) / (2 * Math.PI);
}

/** Drehzahl: 1/min → rad/s. */
export function rpmToRadPerSec(rpm: number): number {
  return (rpm * 2 * Math.PI) / 60;
}
