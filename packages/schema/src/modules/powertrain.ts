import { z } from 'zod';
import { Id, MaterialId, angle, bounded, componentBase, fraction, length } from '../primitives';

/**
 * Antrieb als gerichteter Komponentengraph: Energiespeicher → Wandler → Kraftübertragung.
 * Serieller/paralleler/leistungsverzweigter Hybrid, Mehrmotor-E-Antrieb usw. sind nur
 * unterschiedliche Graphen. Die Kraftübertragung (Kupplung, Getriebe, Differenziale) liegt im
 * Modul `drivetrain`; Kanten dürfen auf deren IDs zeigen.
 */

export const Fuel = z.enum(['gasoline', 'diesel', 'e85', 'methanol', 'hydrogen']);
export type Fuel = z.infer<typeof Fuel>;

// ---------- Verbrennungsmotor (Hubkolben) ----------

export const CylinderArrangement = z.enum(['inline', 'v', 'boxer', 'w']);

export const ValveTiming = z.object({
  /** Steuerzeiten in rad Kurbelwinkel, jeweils bei 1 mm Ventilhub. */
  intakeOpenBTDC: angle(-0.6, 1.2),
  intakeCloseABDC: angle(0, 1.8),
  exhaustOpenBBDC: angle(0, 1.8),
  exhaustCloseATDC: angle(-0.6, 1.2),
  /** Maximaler Ventilhub, m. */
  intakeLift: length(0.003, 0.02),
  exhaustLift: length(0.003, 0.02),
  /** Variable Steuerung: Verstellbereich der Einlassnockenwelle, rad KW (0 = keine). */
  intakeCamPhasing: angle(0, 1.2),
  exhaustCamPhasing: angle(0, 1.2),
  variableLift: z.boolean(),
});

export const Valvetrain = z.object({
  kind: z.enum(['ohv', 'sohc', 'dohc']),
  valvesPerCylinder: z.number().int().min(2).max(5),
  /** Einlassventil-Tellerdurchmesser, m. */
  intakeValveDiameter: length(0.015, 0.06),
  exhaustValveDiameter: length(0.012, 0.05),
  timing: ValveTiming,
});

export const IntakeSystem = z.object({
  /** Länge des Einzelsaugrohrs (Schwingrohr), m. */
  runnerLength: length(0.05, 1),
  runnerDiameter: length(0.02, 0.08),
  /** Sammlervolumen, m³. */
  plenumVolume: bounded(0.0005, 0.03),
  throttleDiameter: length(0.03, 0.12),
  /** Variable Saugrohrlänge: zweite Länge, die oberhalb `switchSpeed` aktiv ist. */
  variableRunner: z
    .object({ shortLength: length(0.05, 1), switchSpeed: bounded(100, 1500) })
    .optional(),
  airFilter: z.enum(['standard', 'performance', 'none']),
});

export const ExhaustManifold = z.object({
  kind: z.enum(['cast-manifold', 'tubular-4-1', 'tubular-4-2-1', 'integrated']),
  primaryLength: length(0.05, 1.2),
  primaryDiameter: length(0.02, 0.07),
});

export const CompressorMap = z.object({
  /** Vereinfachtes Kennfeld: max. Druckverhältnis, Bestpunkt und Stopfgrenze. */
  maxPressureRatio: bounded(1, 5),
  peakEfficiency: bounded(0.5, 0.85),
  /** Reduzierter Massenstrom im Bestpunkt, kg/s. */
  peakEfficiencyFlow: bounded(0.02, 1),
  chokeFlow: bounded(0.03, 1.5),
  surgeFlowAtMaxPr: bounded(0.01, 1),
});

export const TurbineMap = z.object({
  peakEfficiency: bounded(0.5, 0.85),
  /** A/R-Verhältnis des Turbinengehäuses, m. */
  aOverR: length(0.0003, 0.002),
  wastegate: z.boolean(),
  /** Polares Trägheitsmoment des Läufers, kg·m² (bestimmt Ansprechverhalten). */
  rotorInertia: bounded(1e-6, 1e-3),
});

export const Intercooler = z.object({
  kind: z.enum(['air-air', 'air-water']),
  /** Wirkungsgrad (Temperatur-Effektivität) im Auslegungspunkt. */
  effectiveness: bounded(0.3, 0.95),
  /** Druckverlust im Auslegungspunkt, Pa. */
  pressureDrop: bounded(0, 30_000),
  coreVolume: bounded(0.001, 0.05),
});

export const Induction = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('natural') }),
  z.object({
    kind: z.literal('turbo'),
    count: z.number().int().min(1).max(4),
    arrangement: z.enum(['single', 'parallel', 'sequential', 'twin-scroll']),
    /** Soll-Ladedruck (absolut minus Umgebung), Pa. */
    boostPressure: bounded(0, 400_000),
    compressor: CompressorMap,
    turbine: TurbineMap,
    intercooler: Intercooler.optional(),
  }),
  z.object({
    kind: z.literal('supercharger'),
    type: z.enum(['roots', 'twin-screw', 'centrifugal']),
    /** Übersetzung Kurbelwelle → Lader. */
    driveRatio: bounded(0.5, 15),
    boostPressure: bounded(0, 300_000),
    adiabaticEfficiency: bounded(0.4, 0.8),
    intercooler: Intercooler.optional(),
  }),
]);
export type Induction = z.infer<typeof Induction>;

export const EngineMaterials = z.object({
  block: MaterialId,
  head: MaterialId,
  crankshaft: MaterialId,
  conrods: MaterialId,
  pistons: MaterialId,
});

export const IceEngine = z.object({
  ...componentBase,
  type: z.literal('ice'),
  cycle: z.enum(['otto', 'diesel']),
  fuel: Fuel,
  arrangement: CylinderArrangement,
  cylinders: z.number().int().min(1).max(16),
  /** Bankwinkel bei V- und W-Motoren, rad. */
  bankAngle: angle(0, Math.PI),
  bore: length(0.03, 0.2),
  stroke: length(0.03, 0.2),
  conrodLength: length(0.06, 0.4),
  compressionRatio: bounded(6, 25),
  valvetrain: Valvetrain,
  intake: IntakeSystem,
  exhaust: ExhaustManifold,
  induction: Induction,
  mixture: z.enum(['port-injection', 'direct-injection', 'carburetor', 'common-rail']),
  /** Zündzeitpunkt-Strategie: 'mbt' = optimaler Zündwinkel, sonst Klopfabstand in rad. */
  ignition: z.object({ strategy: z.enum(['mbt', 'retarded']), knockMargin: angle(0, 0.2) }),
  /** Drehzahlbegrenzer, rad/s. */
  revLimit: bounded(150, 2200),
  /** Leerlaufdrehzahl, rad/s. */
  idleSpeed: bounded(40, 200),
  /** Lambda bei Volllast (Luftverhältnis). */
  fullLoadLambda: bounded(0.7, 2.5),
  materials: EngineMaterials,
  lubrication: z.enum(['wet-sump', 'dry-sump']),
});
export type IceEngine = z.infer<typeof IceEngine>;

// ---------- Kreiskolbenmotor (Wankel) ----------

export const WankelEngine = z.object({
  ...componentBase,
  type: z.literal('wankel'),
  fuel: Fuel,
  rotors: z.number().int().min(1).max(4),
  /** Erzeugender Radius R, Exzentrizität e und Kammerbreite B, m. */
  generatingRadius: length(0.05, 0.2),
  eccentricity: length(0.008, 0.03),
  rotorWidth: length(0.04, 0.12),
  compressionRatio: bounded(7, 12),
  portType: z.enum(['side', 'peripheral', 'bridge']),
  induction: Induction,
  revLimit: bounded(500, 1500),
  idleSpeed: bounded(60, 150),
});
export type WankelEngine = z.infer<typeof WankelEngine>;

// ---------- Elektrische Komponenten ----------

export const ElectricMotor = z.object({
  ...componentBase,
  type: z.literal('electric-motor'),
  machine: z.enum(['psm', 'asm', 'eesm', 'axial-flux']),
  /** Spitzen- und Dauerleistung, W. */
  peakPower: bounded(1_000, 2_000_000),
  continuousPower: bounded(1_000, 2_000_000),
  peakTorque: bounded(10, 10_000),
  /** Höchstdrehzahl, rad/s. */
  maxSpeed: bounded(300, 3_500),
  /** Spitzenleistungsdauer, s (thermisch begrenzt). */
  peakDuration: bounded(1, 600),
  peakEfficiency: bounded(0.8, 0.99),
  cooling: z.enum(['air', 'water-jacket', 'oil-spray']),
});
export type ElectricMotor = z.infer<typeof ElectricMotor>;

export const Inverter = z.object({
  ...componentBase,
  type: z.literal('inverter'),
  semiconductor: z.enum(['si-igbt', 'sic-mosfet', 'gan']),
  /** Maximaler Phasenstrom (Effektivwert), A. */
  maxCurrent: bounded(50, 3_000),
  peakEfficiency: bounded(0.9, 0.995),
});
export type Inverter = z.infer<typeof Inverter>;

export const CellChemistry = z.enum([
  'nmc',
  'nca',
  'lfp',
  'lto',
  'lmfp',
  'sodium-ion',
  'solid-state',
]);
export const CellFormat = z.enum([
  'cylindrical-18650',
  'cylindrical-21700',
  'cylindrical-4680',
  'pouch',
  'prismatic',
]);

export const Battery = z.object({
  ...componentBase,
  type: z.literal('battery'),
  chemistry: CellChemistry,
  format: CellFormat,
  seriesCells: z.number().int().min(1).max(400),
  parallelCells: z.number().int().min(1).max(100),
  /** Zellkennwerte; ohne Angabe gelten Typwerte aus der Physik-Datenbank. */
  cell: z
    .object({
      capacityAh: bounded(0.5, 500),
      nominalVoltage: bounded(1, 5),
      internalResistance: bounded(1e-5, 0.1),
      mass: bounded(0.01, 10),
    })
    .partial(),
  cooling: z.enum(['passive', 'air', 'liquid-plate', 'immersion']),
  /** Packaging-Faktor: Zellmasse / Packmasse. */
  cellToPackMassRatio: bounded(0.4, 0.95),
});
export type Battery = z.infer<typeof Battery>;

// ---------- Tanks und Brennstoffzelle ----------

export const FuelTank = z.object({
  ...componentBase,
  type: z.literal('fuel-tank'),
  fuel: Fuel.exclude(['hydrogen']),
  /** Nennvolumen, m³ (60 l = 0.06 m³). */
  volume: bounded(0.005, 0.3),
  material: MaterialId,
});
export type FuelTank = z.infer<typeof FuelTank>;

export const HydrogenTank = z.object({
  ...componentBase,
  type: z.literal('hydrogen-tank'),
  /** Nenndruck, Pa (700 bar = 7e7 Pa). */
  pressure: bounded(1e7, 1e8),
  /** Nutzbare H₂-Masse, kg. */
  capacity: bounded(0.5, 20),
  tankType: z.enum(['type-iii', 'type-iv']),
});
export type HydrogenTank = z.infer<typeof HydrogenTank>;

export const FuelCell = z.object({
  ...componentBase,
  type: z.literal('fuel-cell'),
  kind: z.enum(['pemfc']),
  cellCount: z.number().int().min(10).max(1_000),
  /** Aktive Zellfläche, m². */
  activeArea: bounded(0.005, 0.1),
  /** Netto-Systemleistung, W. */
  netPower: bounded(5_000, 500_000),
  operatingPressure: bounded(1e5, 4e5),
});
export type FuelCell = z.infer<typeof FuelCell>;

export const PowertrainComponent = z.discriminatedUnion('type', [
  IceEngine,
  WankelEngine,
  ElectricMotor,
  Inverter,
  Battery,
  FuelTank,
  HydrogenTank,
  FuelCell,
]);
export type PowertrainComponent = z.infer<typeof PowertrainComponent>;
export type PowertrainComponentType = PowertrainComponent['type'];

/** Kante im Antriebsgraph: Energie- bzw. Leistungsfluss von `from` nach `to`. */
export const PowerConnection = z.object({
  from: Id,
  to: Id,
  medium: z.enum(['fuel', 'hydrogen', 'electric-dc', 'electric-ac', 'mechanical']),
});
export type PowerConnection = z.infer<typeof PowerConnection>;

/** Betriebsstrategie für Hybride als reine Parameter (Phase 4). */
export const HybridStrategy = z.object({
  topology: z.enum(['none', 'series', 'parallel', 'power-split']),
  socTarget: fraction(),
  socWindow: bounded(0, 0.5),
  /** Bis zu dieser Geschwindigkeit rein elektrisch, m/s. */
  electricOnlyMaxSpeed: bounded(0, 70),
  boostFraction: fraction(),
});

export const Powertrain = z.object({
  components: z.array(PowertrainComponent).min(1).max(16),
  connections: z.array(PowerConnection).max(64),
  strategy: HybridStrategy,
});
export type Powertrain = z.infer<typeof Powertrain>;
