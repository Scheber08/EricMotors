import { describe, expect, it } from 'vitest';
import type { Battery, ElectricMotor } from '@ericmotors/schema';
import { batteryChargePower, batteryMass, batteryMaxPower, chargeTime10to80 } from './battery';
import { baseSpeed, motorEfficiency, motorMass, motorTorque } from './motor';

const motor: ElectricMotor = {
  id: 'm',
  position: 'rear',
  count: 1,
  type: 'pmsm',
  peakPower: 220e3,
  maxSpeed: 1885,
  reduction: 9,
  cooling: 'liquid',
  quality: 0,
};
const battery: Battery = {
  chemistry: 'nmc',
  cells: 'balanced',
  capacity: 75 * 3.6e6,
  voltage: '400V',
  cooling: 'liquid',
  quality: 0,
};

describe('E-Motor', () => {
  it('konstantes Moment bis zur Eckdrehzahl, darüber ≈ konstante Leistung', () => {
    const wb = baseSpeed(motor);
    expect(motorTorque(motor, 10)).toBeCloseTo(motorTorque(motor, wb), 6);
    expect(motorTorque(motor, wb) * wb).toBeCloseTo(220e3, 0);
    expect(
      motorTorque(motor, (wb + motor.maxSpeed) / 2) * ((wb + motor.maxSpeed) / 2),
    ).toBeGreaterThan(0.95 * 220e3);
    expect(motorTorque(motor, motor.maxSpeed * 1.01)).toBe(0);
  });

  it('Wirkungsgrad im Bereich realer Antriebe, schlechter bei Mini-Last', () => {
    const good = motorEfficiency(motor, 800, 60e3);
    expect(good).toBeGreaterThan(0.9);
    expect(good).toBeLessThan(0.97);
    expect(motorEfficiency(motor, 800, 2e3)).toBeLessThan(good);
  });

  it('Masse plausibel (220-kW-PSM mit Inverter und Getriebe ≈ 80–110 kg)', () => {
    expect(motorMass(motor)).toBeGreaterThan(70);
    expect(motorMass(motor)).toBeLessThan(120);
  });
});

describe('Batterie', () => {
  it('75-kWh-NMC: ≈ 430 kg, ≥ 250 kW, 150 kW Laden, 10–80 % in ≈ 25–35 min', () => {
    expect(batteryMass(battery)).toBeGreaterThan(380);
    expect(batteryMass(battery)).toBeLessThan(480);
    expect(batteryMaxPower(battery)).toBeGreaterThan(250e3);
    expect(batteryChargePower(battery)).toBe(150e3);
    expect(chargeTime10to80(battery) / 60).toBeGreaterThan(20);
    expect(chargeTime10to80(battery) / 60).toBeLessThan(40);
  });

  it('800 V lädt schneller als 400 V, passive Kühlung langsamer', () => {
    expect(
      chargeTime10to80({ ...battery, voltage: '800V', chemistry: 'solid-state' }),
    ).toBeLessThan(chargeTime10to80(battery));
    expect(chargeTime10to80({ ...battery, cooling: 'passive' })).toBeGreaterThan(
      chargeTime10to80(battery),
    );
  });
});
