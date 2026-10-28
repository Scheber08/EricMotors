import { describe, expect, it } from 'vitest';
import { combineInput, type DriveAction, formatLapTime } from './input';

const keys = (...a: DriveAction[]) => new Set(a);

describe('Testfahrt: Eingabe', () => {
  it('Tastatur: Gas, Bremse, Lenkung links positiv', () => {
    expect(combineInput(keys('throttle', 'left'), null)).toEqual({
      throttle: 1,
      brake: 0,
      steer: 1,
      handbrake: false,
    });
    expect(combineInput(keys('right', 'handbrake', 'brake'), null)).toMatchObject({
      steer: -1,
      brake: 1,
      handbrake: true,
    });
    expect(combineInput(keys('left', 'right'), null).steer).toBe(0);
  });

  it('Gamepad: Totzone, Stick rechts lenkt nach rechts, Trigger analog', () => {
    const pad = { stick: 0.05, throttle: 0.4, brake: 0, handbrake: false };
    expect(combineInput(keys(), pad)).toMatchObject({ steer: 0, throttle: 0.4 });
    expect(combineInput(keys(), { ...pad, stick: 0.8 }).steer).toBeCloseTo(-0.8);
    expect(combineInput(keys('left'), { ...pad, stick: -0.8 }).steer).toBe(1);
  });
});

describe('Rundenzeit-Format', () => {
  it('formatiert Minuten, Sekunden und Millisekunden', () => {
    expect(formatLapTime(83.4567)).toBe('1:23.457');
    expect(formatLapTime(5.002)).toBe('0:05.002');
    expect(formatLapTime(null)).toBe('–:––.–––');
  });
});
