import {
  KG_PER_LB,
  M_PER_FT,
  M_PER_IN,
  M_PER_MI,
  NM_PER_LBFFT,
  PA_PER_BAR,
  PA_PER_PSI,
  type PowerUnit,
  type UnitSystem,
  powerFromSI,
  powerToSI,
  radPerSecToRpm,
} from '@ericmotors/schema';

/**
 * Umrechnung SI → Anzeigeeinheit. Jede Größe hat eine Hin- und Rückrichtung, damit Eingabefelder
 * in der Anzeigeeinheit editiert und als SI gespeichert werden.
 */
export type Quantity =
  | 'power'
  | 'torque'
  | 'speed'
  | 'rotation'
  | 'mass'
  | 'length'
  | 'smallLength'
  | 'displacement'
  | 'volume'
  | 'pressure'
  | 'acceleration'
  | 'time'
  | 'distance'
  | 'longDistance'
  | 'consumption'
  | 'co2'
  | 'angle'
  | 'percent'
  | 'ratio'
  | 'money';

export interface UnitContext {
  units: UnitSystem;
  power: PowerUnit;
}

interface UnitDef {
  unit: string;
  toDisplay: (si: number) => number;
  fromDisplay: (display: number) => number;
  digits: number;
}

const lin = (unit: string, factor: number, digits: number): UnitDef => ({
  unit,
  toDisplay: (x) => x / factor,
  fromDisplay: (x) => x * factor,
  digits,
});

export function unitFor(q: Quantity, ctx: UnitContext): UnitDef {
  const metric = ctx.units === 'metric';
  switch (q) {
    case 'power':
      return {
        unit: ctx.power,
        toDisplay: (w) => powerFromSI(w, ctx.power),
        fromDisplay: (x) => powerToSI(x, ctx.power),
        digits: 0,
      };
    case 'torque':
      return metric ? lin('N·m', 1, 0) : lin('lb·ft', NM_PER_LBFFT, 0);
    case 'speed':
      return metric ? lin('km/h', 1 / 3.6, 0) : lin('mph', M_PER_MI / 3600, 0);
    case 'rotation':
      return {
        unit: '1/min',
        toDisplay: radPerSecToRpm,
        fromDisplay: (x) => (x * Math.PI) / 30,
        digits: 0,
      };
    case 'mass':
      return metric ? lin('kg', 1, 0) : lin('lb', KG_PER_LB, 0);
    case 'length':
      return metric ? lin('m', 1, 3) : lin('in', M_PER_IN, 1);
    case 'smallLength':
      return metric ? lin('mm', 1e-3, 1) : lin('in', M_PER_IN, 2);
    case 'displacement':
      return metric ? lin('cm³', 1e-6, 0) : lin('in³', M_PER_IN ** 3, 0);
    case 'volume':
      return metric ? lin('l', 1e-3, 0) : lin('gal', 3.785411784e-3, 1);
    case 'pressure':
      return metric ? lin('bar', PA_PER_BAR, 2) : lin('psi', PA_PER_PSI, 1);
    case 'acceleration':
      return lin('g', 9.80665, 2);
    case 'time':
      return lin('s', 1, 1);
    case 'distance':
      return metric ? lin('m', 1, 1) : lin('ft', M_PER_FT, 0);
    case 'longDistance':
      return metric ? lin('km', 1000, 0) : lin('mi', M_PER_MI, 0);
    case 'consumption':
      // SI: m³/m. Metrisch l/100 km, imperial mpg (US) – reziprok.
      return metric
        ? lin('l/100 km', 1e-8, 1)
        : {
            unit: 'mpg',
            toDisplay: (x) => (x > 0 ? 3.785411784e-3 / (x * M_PER_MI) : 0),
            fromDisplay: (mpg) => (mpg > 0 ? (3.785411784e-3 * 1) / (mpg * M_PER_MI) : 0),
            digits: 1,
          };
    case 'co2':
      return metric ? lin('g/km', 1e-6, 0) : lin('g/mi', 1e-3 / M_PER_MI, 0);
    case 'angle':
      return lin('°', Math.PI / 180, 1);
    case 'percent':
      return lin('%', 0.01, 0);
    case 'ratio':
      return lin('', 1, 2);
    case 'money':
      return lin('€', 1, 0);
  }
}

/** Schmales geschütztes Leerzeichen zwischen Zahl und Einheit (DIN 5008). */
export const NARROW_SPACE = '\u202f';

/** Formatiert einen SI-Wert mit Einheit, z. B. „184 PS“. */
export function formatQuantity(
  si: number | null | undefined,
  q: Quantity,
  ctx: UnitContext,
  locale: string,
  digits?: number,
): string {
  if (si === null || si === undefined || !Number.isFinite(si)) return '–';
  const u = unitFor(q, ctx);
  const value = u.toDisplay(si);
  const text = value.toLocaleString(locale, {
    minimumFractionDigits: digits ?? u.digits,
    maximumFractionDigits: digits ?? u.digits,
  });
  return u.unit ? `${text}${NARROW_SPACE}${u.unit}` : text;
}
