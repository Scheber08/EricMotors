import type { Car } from '@ericmotors/schema';
import { FUELS } from '../constants';
import type { EngineAnalysis } from '../engine/analyze';
import { type CarGeometry, tireDiameter } from './geometry';

/**
 * Massenbilanz: jede Baugruppe mit Masse und Schwerpunktlage (x, z). Empirische Ansätze,
 * kalibriert an Serienfahrzeugen (docs/MODELS.md § Auto-Masse).
 */

export type MassGroup =
  | 'chassis'
  | 'body'
  | 'glass'
  | 'engine'
  | 'drivetrain'
  | 'suspension'
  | 'wheels'
  | 'brakes'
  | 'interior'
  | 'equipment'
  | 'fuel'
  | 'exhaust'
  | 'cooling'
  | 'electrical'
  | 'aero'
  | 'misc';

export interface MassItem {
  group: MassGroup;
  mass: number;
  /** Schwerpunktlage in Fahrzeugkoordinaten, m. */
  x: number;
  z: number;
}

export interface MassProperties {
  items: MassItem[];
  /** Leergewicht inkl. 90 % Kraftstoff, ohne Fahrer, kg. */
  total: number;
  /** Schwerpunkt, m. */
  cgX: number;
  cgZ: number;
  /** Anteil der Vorderachse an der Achslast (0..1). */
  frontWeightShare: number;
  /** Gierträgheitsmoment um die Hochachse (Näherung), kg·m². */
  yawInertia: number;
}

export function engineX(car: Car, g: CarGeometry): number {
  switch (car.engine.placement) {
    case 'front-transverse':
      return 0.12;
    case 'front-longitudinal':
      return -0.25;
    case 'mid-transverse':
    case 'mid-longitudinal':
      return -g.wheelbase + 0.7;
    case 'rear-longitudinal':
      return -g.wheelbase - 0.25;
  }
}

export function massProperties(car: Car, g: CarGeometry, engine: EngineAnalysis): MassProperties {
  const items: MassItem[] = [];
  const add = (group: MassGroup, mass: number, x: number, z: number) =>
    items.push({ group, mass, x, z });
  const centerX = g.overhangFront - g.length / 2;
  const cabinX = -g.wheelbase * 0.55;
  const rearX = -g.wheelbase;
  const vol = g.volume;
  const { model, trim, drivetrain: dt, suspension: s, wheels: w, brakes: b, aero } = car;

  // Rohkarosserie / Chassis
  const chassisType = { monocoque: 1, ladder: 1.4, spaceframe: 0.8 }[model.chassis];
  const chassisMat = { steel: 1, 'galvanised-steel': 1.03, aluminium: 0.65, cfrp: 0.45 }[
    model.chassisMaterial
  ];
  const openTop = model.shape === 'roadster' ? 1.1 : 1;
  add(
    'chassis',
    25 * vol * chassisType * chassisMat * openTop,
    centerX,
    g.rideHeight + 0.3 * g.height,
  );

  const shapeBody = {
    roadster: 0.85,
    pickup: 0.9,
    van: 1.1,
    suv: 1.05,
    coupe: 1,
    sedan: 1,
    wagon: 1.03,
    hatchback: 1,
  }[model.shape];
  const panelMat = {
    steel: 1,
    'galvanised-steel': 1.03,
    aluminium: 0.6,
    fibreglass: 0.7,
    cfrp: 0.45,
  }[trim.bodyMaterial];
  add('body', 11 * vol * shapeBody * panelMat, centerX, g.rideHeight + 0.55 * g.height);
  add('glass', (25 + 3 * vol) * (model.shape === 'roadster' ? 0.5 : 1), cabinX, 0.8 * g.height);

  // Motor und Antriebsstrang
  const ex = engineX(car, g);
  add('engine', engine.mass, ex, g.rideHeight + 0.35);
  const gears = dt.ratios.length;
  const gearbox = {
    manual: 38 + 3 * Math.max(0, gears - 5),
    automatic: 65 + 3 * Math.max(0, gears - 6),
    dct: 75,
    sequential: 45,
    cvt: 65,
  }[dt.gearbox];
  const awd = dt.layout === 'awd' ? 55 : 0;
  const propShaft = dt.layout === 'rwd' && car.engine.placement.startsWith('front') ? 15 : 0;
  const diff = { open: 0, viscous: 4, 'plate-lsd': 4, torsen: 5, active: 10 }[dt.differential];
  add('drivetrain', gearbox + awd + propShaft + diff, ex - 0.4, g.rideHeight + 0.25);

  // Fahrwerk
  const front = { 'solid-axle': 70, macpherson: 45, 'double-wishbone': 55, pushrod: 50 }[
    model.frontSuspension
  ];
  const rear = {
    'solid-axle': 75,
    'torsion-beam': 35,
    'semi-trailing': 45,
    'multi-link': 55,
    'double-wishbone': 55,
    pushrod: 50,
  }[model.rearSuspension];
  const extras =
    { passive: 0, progressive: 2, hydropneumatic: 20, air: 15 }[s.springs] +
    (s.dampers === 'adaptive' ? 6 : 0) +
    (s.antiRoll === 'active' ? 20 : 0);
  add(
    'suspension',
    front + extras / 2 + (trim.powerSteering === 'none' ? 0 : 7),
    0,
    g.rideHeight + 0.15,
  );
  add('suspension', rear + extras / 2, rearX, g.rideHeight + 0.15);

  // Räder: Felge ~ (D/17″)^1,5 · Breite, Reifen ~ Breite · (Außendurchmesser)^1,5
  const rimMat = { steel: 1.25, alloy: 1, forged: 0.8, magnesium: 0.7, cfrp: 0.55 }[w.rimMaterial];
  for (const [tire, x] of [
    [w.front, 0],
    [w.rear, rearX],
  ] as const) {
    const rim = 9 * Math.pow(w.rimDiameter / 0.4318, 1.5) * ((0.85 * tire.width) / 0.19) * rimMat;
    const tireMass =
      9.5 *
      (tire.width / 0.225) *
      Math.pow(tireDiameter(w.rimDiameter, tire.width, tire.aspectRatio) / 0.65, 1.5);
    add(
      'wheels',
      2 * (rim + tireMass),
      x,
      tireDiameter(w.rimDiameter, tire.width, tire.aspectRatio) / 2,
    );
  }

  // Bremsen: Scheibe ~ D², Sattel ~ Kolbenzahl
  for (const [brake, x] of [
    [b.front, 0],
    [b.rear, rearX],
  ] as const) {
    const disc =
      { drum: 7, 'solid-disc': 5, 'vented-disc': 7, 'carbon-ceramic': 3.5 }[brake.type] *
      Math.pow(brake.diameter / 0.3, 2);
    add('brakes', 2 * (disc + 2 + 0.5 * brake.pistons), x, 0.3);
  }

  // Innenraum und Ausstattung
  const interior = { basic: 40, standard: 70, premium: 100, luxury: 140, sport: 50, race: 15 }[
    trim.interior
  ];
  const seat = trim.interior === 'race' ? 8 : trim.interior === 'sport' ? 13 : 17;
  add('interior', interior + seat * trim.seats, cabinX, g.rideHeight + 0.35);
  const equipment =
    { none: 0, radio: 3, infotainment: 8, 'premium-infotainment': 18 }[trim.entertainment] +
    { basic: 10, standard: 25, advanced: 40, modern: 55 }[trim.safety] +
    (trim.assists.abs ? 4 : 0) +
    (trim.assists.esc || trim.assists.tcs ? 1 : 0);
  add('equipment', equipment, cabinX * 0.6, g.rideHeight + 0.45);

  // Kraftstoff (90 % Tankfüllung), Abgas, Kühlung, Elektrik, Aero, Sonstiges
  const fuel = FUELS[car.engine.variant.fuel];
  add('fuel', 0.9 * g.tankVolume * fuel.density + 8, rearX + 0.4, g.rideHeight + 0.2);
  const pipes = car.engine.family.layout !== 'inline' && car.engine.family.cylinders >= 6 ? 1.6 : 1;
  add(
    'exhaust',
    (15 + 200 * car.engine.variant.exhaustDiameter) * pipes,
    (ex + rearX) / 2,
    g.rideHeight + 0.05,
  );
  add(
    'cooling',
    8 + 25 * (engine.curve.peakPower.power / 300e3) + 5 * aero.cooling,
    ex + 0.5,
    g.rideHeight + 0.35,
  );
  add('electrical', 25 + 3 * vol, centerX, g.rideHeight + 0.4);
  add(
    'aero',
    4 * aero.frontDownforce +
      6 * aero.rearDownforce +
      { none: 0, partial: 4, full: 8 }[aero.undertray],
    centerX,
    g.rideHeight,
  );
  add('misc', 60 + 4 * vol, centerX, g.rideHeight + 0.4);

  const total = items.reduce((a, i) => a + i.mass, 0);
  const cgX = items.reduce((a, i) => a + i.mass * i.x, 0) / total;
  const cgZ = items.reduce((a, i) => a + i.mass * i.z, 0) / total;
  const frontWeightShare = Math.min(1, Math.max(0, (cgX + g.wheelbase) / g.wheelbase));
  // Gierträgheit: Punktmassen um den Schwerpunkt plus Grundanteil eines homogenen Quaders.
  const yawInertia =
    items.reduce((a, i) => a + i.mass * (i.x - cgX) ** 2, 0) + (total * g.width * g.width) / 12;
  return { items, total, cgX, cgZ, frontWeightShare, yawInertia };
}
