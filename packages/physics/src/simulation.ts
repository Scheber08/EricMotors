import type { Car } from '@ericmotors/schema';
import { type CarAnalysis, analyzeCar } from './car/analyze';
import { brakeCapacity } from './car/performance';

/**
 * Schnittstelle zur späteren Fahrsimulation (Phase 5). Flache, vorberechnete Daten, die ein
 * Integrator im Web Worker bzw. in WASM ohne Kenntnis des Schemas nutzen kann. Alles in SI.
 */
export interface SimulationInput {
  mass: number;
  /** Schwerpunkt (x, z) in Fahrzeugkoordinaten nach ISO 8855, m. */
  cg: [number, number];
  yawInertia: number;
  wheelbase: number;
  track: [number, number];
  /** Volllastmoment über Motordrehzahl: [rad/s, N·m]. */
  torqueCurve: [number, number][];
  idleSpeed: number;
  revLimit: number;
  gearRatios: number[];
  finalDrive: number;
  shiftTime: number;
  drivetrainEfficiency: number;
  /** Antriebsverteilung Vorderachse (0..1). */
  frontDriveShare: number;
  differential: Car['drivetrain']['differential'];
  tire: { grip: [number, number]; rollingResistance: [number, number]; radius: [number, number] };
  aero: { dragArea: number; liftAreaFront: number; liftAreaRear: number };
  brakes: { maxForce: number; frontBias: number; abs: boolean };
  assists: Car['trim']['assists'];
  fuelTank: number;
}

export function toSimulationInput(
  car: Car,
  analysis: CarAnalysis = analyzeCar(car),
): SimulationInput {
  const { mass, geometry: g, engine, tires, aero, performance } = analysis;
  const dt = car.drivetrain;
  return {
    mass: performance.testMass,
    cg: [mass.cgX, mass.cgZ],
    yawInertia: mass.yawInertia,
    wheelbase: g.wheelbase,
    track: [g.trackFront, g.trackRear],
    torqueCurve: engine.curve.points.map((p) => [p.speed, p.torque]),
    idleSpeed: engine.curve.points[0]!.speed,
    revLimit: car.engine.variant.revLimit,
    gearRatios: [...dt.ratios],
    finalDrive: dt.finalDrive,
    shiftTime: { manual: 0.35, automatic: 0.25, dct: 0.06, sequential: 0.1, cvt: 0 }[dt.gearbox],
    drivetrainEfficiency: performance.drivetrainEfficiency,
    frontDriveShare: dt.layout === 'fwd' ? 1 : dt.layout === 'rwd' ? 0 : dt.awdFrontShare,
    differential: dt.differential,
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
    fuelTank: g.tankVolume,
  };
}
