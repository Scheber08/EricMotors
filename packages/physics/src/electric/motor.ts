import type { ElectricMotor } from '@ericmotors/schema';

/**
 * E-Maschine (spielnah, docs/MODELS.md § Elektroantrieb).
 *
 * Kennlinie: konstantes Moment bis zur Eckdrehzahl ω_E = q · ω_max, darüber Feldschwächung mit
 * nahezu konstanter Leistung, die zur Höchstdrehzahl leicht abfällt:
 *   M(ω) = P / ω_E                       für ω ≤ ω_E
 *   M(ω) = P · (1 − 0,12 · x²) / ω       für ω > ω_E,  x = (ω − ω_E) / (ω_max − ω_E)
 * Typwerte (Eckdrehzahlverhältnis, Wirkungsgrad, Leistungsdichte) sind Richtwerte aktueller
 * Serienantriebe (PSM, ASM, Axialfluss).
 */

const TYPE = {
  pmsm: { baseRatio: 0.33, peakEfficiency: 0.96, kwPerKg: 3.5, eurPerKw: 11 },
  induction: { baseRatio: 0.3, peakEfficiency: 0.935, kwPerKg: 2.6, eurPerKw: 8 },
  'axial-flux': { baseRatio: 0.4, peakEfficiency: 0.965, kwPerKg: 6, eurPerKw: 18 },
} as const;

/** Anteil der Spitzenleistung, der dauerhaft (thermisch) verfügbar ist. */
const CONTINUOUS = { air: 0.45, liquid: 0.6, 'oil-spray': 0.75 } as const;

export interface MotorCurvePoint {
  speed: number;
  torque: number;
  power: number;
}

/** Eckdrehzahl, rad/s. */
export const baseSpeed = (m: ElectricMotor) => m.maxSpeed * TYPE[m.type].baseRatio;

/** Gesamtleistung aller Motoren dieser Position (count × Spitzenleistung), W. */
export const unitPeakPower = (m: ElectricMotor) => m.peakPower * m.count;

/** Volllastmoment der Motoreinheit (alle `count` Motoren) bei Motordrehzahl ω, N·m. */
export function motorTorque(m: ElectricMotor, omega: number): number {
  if (omega > m.maxSpeed + 1e-9) return 0;
  const wb = baseSpeed(m);
  const p = unitPeakPower(m);
  if (omega <= wb) return p / wb;
  const x = (omega - wb) / (m.maxSpeed - wb);
  return (p * (1 - 0.12 * x * x)) / omega;
}

export function motorCurve(m: ElectricMotor, steps = 64): MotorCurvePoint[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const speed = Math.max(1, (m.maxSpeed * i) / steps);
    const torque = motorTorque(m, speed);
    return { speed, torque, power: torque * speed };
  });
}

/**
 * Wirkungsgrad Motor + Inverter im Betriebspunkt (vereinfachtes Kennfeld): bestes Niveau bei
 * mittlerer Last und Drehzahl, Abfall bei sehr kleiner Last und nahe der Höchstdrehzahl.
 */
export function motorEfficiency(m: ElectricMotor, omega: number, power: number): number {
  const load = Math.min(1, Math.max(0, power / unitPeakPower(m)));
  const speedFrac = Math.min(1, omega / m.maxSpeed);
  const inverter = 0.975;
  const peak = TYPE[m.type].peakEfficiency + 0.002 * m.quality;
  return Math.max(
    0.5,
    (peak - 0.04 * Math.pow(1 - Math.min(1, load * 8), 3) - 0.04 * Math.pow(speedFrac, 4)) *
      inverter,
  );
}

export const continuousPower = (m: ElectricMotor) => unitPeakPower(m) * CONTINUOUS[m.cooling];

/** Masse von Motoren, Invertern und Untersetzungsgetriebe, kg. */
export function motorMass(m: ElectricMotor): number {
  const kw = m.peakPower / 1000;
  const reduction = m.position === 'gearbox' ? 0 : 9;
  return (
    m.count * (kw / TYPE[m.type].kwPerKg + kw / 25 + 5) + reduction * (m.count === 2 ? 1.6 : 1)
  );
}

/** Herstellkosten in € (Motor, Inverter, Untersetzung), Qualität × (1 + 0,07 · q). */
export function motorCost(m: ElectricMotor): number {
  const kw = m.peakPower / 1000;
  return m.count * (kw * (TYPE[m.type].eurPerKw + 4) + 300) * (1 + 0.07 * m.quality);
}
