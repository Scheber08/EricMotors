import { describe, expect, it } from 'vitest';
import { powerFromSI, powerToSI, radPerSecToRpm, rpmToRadPerSec, speedFromSI } from './units';

describe('units', () => {
  it('rechnet Leistung zwischen W, kW, PS und hp um', () => {
    expect(powerFromSI(735.49875, 'PS')).toBeCloseTo(1, 12);
    expect(powerFromSI(100_000, 'kW')).toBe(100);
    // 100 kW ≈ 135,96 PS ≈ 134,10 hp
    expect(powerFromSI(100_000, 'PS')).toBeCloseTo(135.962, 3);
    expect(powerFromSI(100_000, 'hp')).toBeCloseTo(134.102, 3);
  });

  it('ist bei Hin- und Rückrechnung verlustfrei', () => {
    for (const unit of ['kW', 'PS', 'hp'] as const) {
      expect(powerToSI(powerFromSI(123_456, unit), unit)).toBeCloseTo(123_456, 6);
    }
  });

  it('rechnet Geschwindigkeit metrisch und imperial', () => {
    expect(speedFromSI(27.7778, 'metric')).toBeCloseTo(100, 3);
    expect(speedFromSI(44.704, 'imperial')).toBeCloseTo(100, 9);
  });

  it('rechnet Drehzahl zwischen rad/s und 1/min', () => {
    expect(radPerSecToRpm(rpmToRadPerSec(7000))).toBeCloseTo(7000, 9);
    expect(rpmToRadPerSec(60)).toBeCloseTo(2 * Math.PI, 12);
  });
});

describe('imperiale Konstanten', () => {
  it('stimmen mit NIST SP 811 überein', async () => {
    const u = await import('./units');
    expect(u.W_PER_HP).toBeCloseTo(745.69987, 5);
    expect(u.NM_PER_LBFFT).toBeCloseTo(1.355818, 6);
    expect(u.PA_PER_PSI).toBeCloseTo(6894.757, 3);
  });
});
