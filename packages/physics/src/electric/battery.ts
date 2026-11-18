import type { Battery } from '@ericmotors/schema';

/**
 * Traktionsbatterie auf Packebene (spielnah, Richtwerte 2025/26). Energie in J intern.
 * Leistung über C-Rate: P_max = E[kWh] · C · Kühlfaktor (kW).
 */
const CHEMISTRY = {
  lfp: { whPerKg: 140, eurPerKwh: 85, dischargeC: 3.5, chargeC: 1.8, cycles: 4000 },
  nmc: { whPerKg: 175, eurPerKwh: 115, dischargeC: 5, chargeC: 2.2, cycles: 1500 },
  nca: { whPerKg: 190, eurPerKwh: 125, dischargeC: 6, chargeC: 2, cycles: 1200 },
  'solid-state': { whPerKg: 250, eurPerKwh: 220, dischargeC: 5, chargeC: 3, cycles: 2000 },
} as const;

/** Zellauslegung: Faktoren auf Energiedichte, Entlade-C-Rate und Preis. */
const CELLS = {
  energy: { density: 1.08, c: 0.75, cost: 0.95 },
  balanced: { density: 1, c: 1, cost: 1 },
  power: { density: 0.82, c: 2.3, cost: 1.3 },
} as const;

const COOL_DISCHARGE = { passive: 0.6, air: 0.8, liquid: 1 } as const;
const COOL_CHARGE = { passive: 0.5, air: 0.7, liquid: 1 } as const;
const VOLTAGE_CHARGE_KW = { '400V': 150, '800V': 300 } as const;

export const kwhOf = (b: Battery) => b.capacity / 3.6e6;

export function batteryMass(b: Battery): number {
  return (
    (kwhOf(b) * 1000) /
    (CHEMISTRY[b.chemistry].whPerKg * CELLS[b.cells].density) /
    (1 + 0.01 * b.quality)
  );
}

export function batteryCost(b: Battery): number {
  return (
    (kwhOf(b) * CHEMISTRY[b.chemistry].eurPerKwh * CELLS[b.cells].cost + 500) *
    (1 + 0.07 * b.quality)
  );
}

/** Maximale Entladeleistung, W. Kleine Hybridbatterien sind als Hochleistungszellen ausgelegt (höhere C-Rate). */
export function batteryMaxPower(b: Battery): number {
  const kwh = kwhOf(b);
  const highPower = kwh < 20 ? 1 + (20 - kwh) / 8 : 1;
  return (
    kwh *
    CHEMISTRY[b.chemistry].dischargeC *
    CELLS[b.cells].c *
    highPower *
    COOL_DISCHARGE[b.cooling] *
    1000 *
    (1 + 0.02 * b.quality)
  );
}

/** Maximale DC-Ladeleistung, W (begrenzt durch C-Rate und Spannungsebene). */
export function batteryChargePower(b: Battery): number {
  const byC = kwhOf(b) * CHEMISTRY[b.chemistry].chargeC * COOL_CHARGE[b.cooling];
  return Math.min(byC, VOLTAGE_CHARGE_KW[b.voltage]) * 1000;
}

/** Ladezeit 10 → 80 % am Schnelllader, s (mittlere Leistung ≈ 75 % der Spitze). */
export function chargeTime10to80(b: Battery): number {
  return (0.7 * b.capacity) / (0.75 * batteryChargePower(b));
}

/** Entladewirkungsgrad (Innenwiderstand, spielnah). */
export const BATTERY_EFFICIENCY = 0.96;

/** Zyklenfestigkeit als Zuverlässigkeitsmaß (0..1). */
export function batteryDurability(b: Battery): number {
  const cycles =
    CHEMISTRY[b.chemistry].cycles *
    (b.cooling === 'liquid' ? 1 : b.cooling === 'air' ? 0.8 : 0.6) *
    (1 + 0.05 * b.quality);
  return Math.min(1, cycles / 3000);
}
