import { describe, expect, it } from 'vitest';
import { type Quantity, formatQuantity, unitFor } from './format';

const metric = { units: 'metric', power: 'PS' } as const;
const imperial = { units: 'imperial', power: 'hp' } as const;

describe('Einheiten', () => {
  it('formatiert typische Werte', () => {
    expect(formatQuantity(135e3, 'power', metric, 'de')).toBe('184 PS');
    expect(formatQuantity(100 / 3.6, 'speed', metric, 'de')).toBe('100 km/h');
    expect(formatQuantity(6.5e-8, 'consumption', metric, 'de')).toBe('6,5 l/100 km');
    expect(formatQuantity(null, 'mass', metric, 'de')).toBe('–');
  });

  it('6,5 l/100 km ≈ 36,2 mpg (US)', () => {
    expect(unitFor('consumption', imperial).toDisplay(6.5e-8)).toBeCloseTo(36.19, 1);
  });

  it('Hin- und Rückrechnung ist verlustfrei', () => {
    const quantities: Quantity[] = [
      'power',
      'torque',
      'speed',
      'rotation',
      'mass',
      'length',
      'smallLength',
      'pressure',
      'volume',
      'consumption',
    ];
    for (const ctx of [metric, imperial]) {
      for (const q of quantities) {
        const u = unitFor(q, ctx);
        expect(u.fromDisplay(u.toDisplay(1.2345)), `${q}/${ctx.units}`).toBeCloseTo(1.2345, 9);
      }
    }
  });
});
