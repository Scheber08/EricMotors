import type { Car } from '@ericmotors/schema';
import { ELECTRICITY_PRICE, FUELS } from '../constants';
import { batteryCost } from '../electric/battery';
import { motorCost } from '../electric/motor';
import type { Consumption } from './consumption';
import type { CarGeometry } from './geometry';

/**
 * Herstellkosten des Autos in € (Verbrenner aus der Motoranalyse, E-Motoren und Batterie hier). Spielnahe
 * Richtwerte; jeder Abschnitt wird mit (1 + 0,07 · Qualität) skaliert.
 */
const q = (quality: number) => 1 + 0.07 * quality;

export interface CarCostBreakdown {
  engine: number;
  electric: number;
  body: number;
  drivetrain: number;
  chassis: number;
  wheels: number;
  brakes: number;
  trim: number;
  aero: number;
  assembly: number;
  total: number;
}

export function carCost(car: Car, g: CarGeometry, engineCost: number): CarCostBreakdown {
  const { model, trim, drivetrain: dt, suspension: s, wheels: w, brakes: b, aero } = car;
  const v = Math.pow(g.volume, 0.7);

  const chassisMat = { steel: 1, 'galvanised-steel': 1.1, aluminium: 2.2, cfrp: 6 }[
    model.chassisMaterial
  ];
  const chassisType = { monocoque: 1, ladder: 0.8, spaceframe: 1.6 }[model.chassis];
  const panelMat = { steel: 1, 'galvanised-steel': 1.1, aluminium: 1.8, fibreglass: 1.3, cfrp: 5 }[
    trim.bodyMaterial
  ];
  const paint = { solid: 1, metallic: 1.15, pearl: 1.3, matte: 1.25, satin: 1.2, chrome: 2 }[
    car.paint.base.finish
  ];
  const body = (500 * v * chassisMat * chassisType + 250 * v * panelMat * paint) * q(model.quality);

  const gears = dt.ratios.length;
  const gearbox = {
    manual: 600 + 60 * gears,
    automatic: 1600,
    dct: 2200,
    sequential: 3000,
    cvt: 1500,
  }[dt.gearbox];
  const diff = { open: 100, viscous: 300, 'plate-lsd': 500, torsen: 700, active: 1500 }[
    dt.differential
  ];
  const pt = car.powertrain;
  // Elektroauto: kein Schaltgetriebe (Untersetzung ist im Motorpreis), Differenzial bleibt.
  const drivetrain = pt.engine
    ? (gearbox + diff + (dt.layout === 'awd' ? 1200 : 0)) * q(dt.quality)
    : diff * q(dt.quality);
  const electric =
    pt.motors.reduce((a, m) => a + motorCost(m), 0) +
    (pt.battery ? batteryCost(pt.battery) : 0) +
    (pt.type === 'ice' ? 0 : 800);

  const front = { 'solid-axle': 250, macpherson: 300, 'double-wishbone': 550, pushrod: 900 }[
    model.frontSuspension
  ];
  const rear = {
    'solid-axle': 250,
    'torsion-beam': 200,
    'semi-trailing': 350,
    'multi-link': 650,
    'double-wishbone': 550,
    pushrod: 900,
  }[model.rearSuspension];
  const springs = { passive: 200, progressive: 300, hydropneumatic: 1500, air: 1800 }[s.springs];
  const dampers = { 'twin-tube': 160, 'mono-tube': 400, adaptive: 1200 }[s.dampers];
  const arb = { none: 0, passive: 80, active: 2000 }[s.antiRoll];
  const steering = { none: 150, hydraulic: 450, electric: 550 }[trim.powerSteering];
  const chassis = (front + rear + springs + dampers + arb + steering) * q(s.quality);

  const rim =
    { steel: 40, alloy: 120, forged: 400, magnesium: 600, cfrp: 1500 }[w.rimMaterial] *
    Math.pow(w.rimDiameter / 0.4318, 2);
  const tire = {
    eco: 70,
    touring: 90,
    sport: 160,
    'semi-slick': 250,
    slick: 400,
    'all-terrain': 140,
    offroad: 160,
  }[w.tireType];
  const wheels = 4 * (rim + tire * ((w.front.width + w.rear.width) / 0.45)) * q(w.quality);

  const axleBrake = (a: Car['brakes']['front']) =>
    2 *
    ({ drum: 40, 'solid-disc': 60, 'vented-disc': 90, 'carbon-ceramic': 2500 }[a.type] *
      Math.pow(a.diameter / 0.3, 2) +
      40 * a.pistons);
  const pads = { organic: 30, 'semi-metallic': 50, ceramic: 120, race: 200 }[b.pads];
  const brakes = (axleBrake(b.front) + axleBrake(b.rear) + pads) * q(b.quality);

  const interior =
    { basic: 400, standard: 1200, premium: 3000, luxury: 6000, sport: 1800, race: 600 }[
      trim.interior
    ] +
    120 * trim.seats;
  const entertainment = { none: 0, radio: 80, infotainment: 600, 'premium-infotainment': 2000 }[
    trim.entertainment
  ];
  const safety = { basic: 200, standard: 600, advanced: 1200, modern: 2000 }[trim.safety];
  const assists =
    (trim.assists.abs ? 250 : 0) +
    (trim.assists.tcs ? 100 : 0) +
    (trim.assists.esc ? 200 : 0) +
    (trim.assists.launchControl ? 150 : 0);
  const trimCost = (interior + entertainment + safety + assists) * q(trim.quality);

  const aeroCost =
    300 * aero.frontDownforce +
    600 * aero.rearDownforce +
    { none: 0, partial: 150, full: 400 }[aero.undertray];
  const assembly = 1500 + 150 * g.volume;

  const parts = {
    engine: engineCost,
    electric,
    body,
    drivetrain,
    chassis,
    wheels,
    brakes,
    trim: trimCost,
    aero: aeroCost,
    assembly,
  };
  return { ...parts, total: Object.values(parts).reduce((a, b) => a + b, 0) };
}

/**
 * Unterhaltskosten pro Jahr (15 000 km), €: Kraftstoff, Wartung (abhängig von Herstellkosten
 * und Zuverlässigkeit), Reifenverschleiß.
 */
export function annualRunningCost(
  car: Car,
  productionCost: number,
  reliability: number,
  consumption: Consumption,
): number {
  const distance = 15_000e3;
  const engine = car.powertrain.engine;
  const fuel = engine
    ? consumption.fuelPerDistance * distance * 1000 * FUELS[engine.variant.fuel].pricePerLiter
    : 0;
  const electricity = ((consumption.electricPerDistance * distance) / 3.6e6) * ELECTRICITY_PRICE;
  // Elektroautos haben weniger Verschleißteile (kein Ölwechsel, Bremsen schonender).
  const serviceFactor =
    car.powertrain.type === 'electric' ? 0.6 : car.powertrain.type === 'hybrid' ? 1.1 : 1;
  const service = 0.025 * productionCost * (1.6 - reliability / 100) * serviceFactor;
  const tireWear = {
    eco: 120,
    touring: 150,
    sport: 300,
    'semi-slick': 700,
    slick: 1500,
    'all-terrain': 200,
    offroad: 250,
  }[car.wheels.tireType];
  return fuel + electricity + service + tireWear;
}
