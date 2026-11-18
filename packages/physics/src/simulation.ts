import type { Car } from '@ericmotors/schema';
import { type CarAnalysis, analyzeCar } from './car/analyze';
import { driveUnits, electricPowerLimit } from './car/drive';
import { brakeCapacity } from './car/performance';

/**
 * Schnittstelle zur späteren Fahrsimulation (Phase 5). Flache, vorberechnete Daten, die ein
 * Integrator im Web Worker bzw. in WASM ohne Kenntnis des Schemas nutzen kann. Alles in SI.
 */
export interface SimulationDriveUnit {
  kind: 'engine' | 'hybrid' | 'motor';
  /** Achse; „split“ = über das Mitteldifferenzial verteilt (frontDriveShare). */
  axle: 'front' | 'rear' | 'split';
  /** Volllastmoment über Wellendrehzahl: [rad/s, N·m, davon elektrisch N·m]. */
  torqueCurve: [number, number, number][];
  idleSpeed: number;
  maxSpeed: number;
  /** Gesamtübersetzungen (Gang · Achse bzw. Untersetzung). */
  ratios: number[];
  cvt: boolean;
  shiftTime: number;
  efficiency: number;
}

export interface SimulationInput {
  powertrain: Car['powertrain']['type'];
  mass: number;
  /** Schwerpunkt (x, z) in Fahrzeugkoordinaten nach ISO 8855, m. */
  cg: [number, number];
  yawInertia: number;
  wheelbase: number;
  track: [number, number];
  units: SimulationDriveUnit[];
  /** Antriebsverteilung Vorderachse (0..1) für Einheiten mit Achse „split“. */
  frontDriveShare: number;
  differential: Car['drivetrain']['differential'];
  /** Maximale elektrische Leistung an den Motorwellen (Batteriegrenze), W; 0 ohne Batterie. */
  electricPowerLimit: number;
  /** Nutzbare Batterieenergie, J; 0 ohne Batterie. */
  batteryEnergy: number;
  tire: { grip: [number, number]; rollingResistance: [number, number]; radius: [number, number] };
  aero: { dragArea: number; liftAreaFront: number; liftAreaRear: number };
  brakes: { maxForce: number; frontBias: number; abs: boolean };
  assists: Car['trim']['assists'];
  /** Tankvolumen, m³; 0 beim Elektroauto. */
  fuelTank: number;
}

const SAMPLES = 40;

export function toSimulationInput(
  car: Car,
  analysis: CarAnalysis = analyzeCar(car),
): SimulationInput {
  const { mass, geometry: g, engine, tires, aero, performance } = analysis;
  const dt = car.drivetrain;
  const units = driveUnits(car, engine).map((u): SimulationDriveUnit => {
    const torqueCurve: [number, number, number][] = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const w = u.idleSpeed + ((u.maxSpeed - u.idleSpeed) * i) / SAMPLES;
      torqueCurve.push([w, u.torque(w), u.electricTorque(w)]);
    }
    return {
      kind: u.kind,
      axle: u.axle,
      torqueCurve,
      idleSpeed: u.idleSpeed,
      maxSpeed: u.maxSpeed,
      ratios: [...u.ratios],
      cvt: u.cvt,
      shiftTime: u.shiftTime,
      efficiency: u.efficiency,
    };
  });
  return {
    powertrain: car.powertrain.type,
    mass: performance.testMass,
    cg: [mass.cgX, mass.cgZ],
    yawInertia: mass.yawInertia,
    wheelbase: g.wheelbase,
    track: [g.trackFront, g.trackRear],
    units,
    frontDriveShare: dt.layout === 'fwd' ? 1 : dt.layout === 'rwd' ? 0 : dt.awdFrontShare,
    differential: dt.differential,
    electricPowerLimit: electricPowerLimit(car),
    batteryEnergy: car.powertrain.battery?.capacity ?? 0,
    tire: {
      grip: [tires.front.grip, tires.rear.grip],
      rollingResistance: [tires.front.rollingResistance, tires.rear.rollingResistance],
      radius: [tires.front.radius, tires.rear.radius],
    },
    aero: {
      dragArea: aero.dragCoefficient * aero.frontalArea,
      liftAreaFront: aero.liftFront * aero.frontalArea,
      liftAreaRear: aero.liftRear * aero.frontalArea,
    },
    brakes: { maxForce: brakeCapacity(car), frontBias: car.brakes.bias, abs: car.trim.assists.abs },
    assists: { ...car.trim.assists },
    fuelTank: car.powertrain.engine ? g.tankVolume : 0,
  };
}
