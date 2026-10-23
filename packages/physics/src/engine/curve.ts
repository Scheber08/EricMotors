import type { EngineFamily, EngineVariant } from '@ericmotors/schema';
import { FUELS, GAMMA_AIR, P_AMBIENT, R_AIR, T_AMBIENT } from '../constants';

/**
 * Spielnahes Mittelwert-Motormodell (docs/MODELS.md § Motor).
 *
 *   IMEP = η_i · λ_L · ρ_Ladung · H_u / (L_st · λ)        (Heywood 1988, Gl. 2.41)
 *   BMEP = IMEP − FMEP
 *   M    = BMEP · V_H / (4π)                                (Viertakt)
 *   P    = M · ω
 *
 * Alle Teilmodelle sind bewusst einfach, dimensionsrichtig und so kalibriert, dass
 * Serienmotoren in etwa ±15 % ihrer realen Leistung landen.
 */

export interface EngineInput {
  family: EngineFamily;
  variant: EngineVariant;
}

export interface CurvePoint {
  /** Drehzahl, rad/s. */
  speed: number;
  /** Drehmoment an der Kurbelwelle, N·m. */
  torque: number;
  /** Leistung, W. */
  power: number;
  /** Ladedruck (Überdruck), Pa. */
  boost: number;
  /** Liefergrad (bezogen auf Saugrohrzustand). */
  volumetricEfficiency: number;
  /** Effektiver Wirkungsgrad. */
  efficiency: number;
  /** Kraftstoffmassenstrom, kg/s. */
  fuelFlow: number;
}

export interface EngineCurve {
  points: CurvePoint[];
  peakPower: { power: number; speed: number };
  peakTorque: { torque: number; speed: number };
  /** Größter Ladedruck, Pa. */
  peakBoost: number;
  /** Klopfreserve: < 0 bedeutet, das Steuergerät muss Zündung zurücknehmen. */
  knockMargin: number;
}

const TWO_PI = 2 * Math.PI;

export const displacement = (f: EngineFamily, v: EngineVariant) =>
  (Math.PI / 4) * v.bore * v.bore * v.stroke * f.cylinders;

/** Mittlere Kolbengeschwindigkeit c_m = 2 · s · n, m/s. */
export const meanPistonSpeed = (stroke: number, speed: number) => (2 * stroke * speed) / TWO_PI;

const smoothstep = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

// ---------- Liefergrad ----------

/** Spitzenliefergrad nach Ventiltrieb (Kalibrierwerte, typische Serienmotoren 0,85–0,98). */
function peakVolumetricEfficiency(f: EngineFamily, v: EngineVariant): number {
  const head = { ohv: 0.9, sohc: 0.93, dohc: 0.97 }[f.headType];
  const valves = (f.valvesPerCylinder - 2) * 0.012;
  const headers = { cast: 0, 'short-tubular': 0.015, 'long-tubular': 0.03, 'equal-length': 0.035 }[
    v.headers
  ];
  return head + valves + headers + 0.04 * v.camProfile + (v.vvl ? 0.015 : 0);
}

/**
 * Liefergrad über der Kolbengeschwindigkeit: Glockenkurve in log(c_m) um die
 * „Atem-Geschwindigkeit“ c_peak. Schärfere Nocken verschieben das Maximum nach oben und machen
 * die Kurve schmaler, VVT/VVL verbreitern sie. Oberhalb des Maximums fällt die Kurve flacher ab
 * (Nachladeeffekt der späten Einlassschließung).
 */
function volumetricEfficiency(f: EngineFamily, v: EngineVariant, pistonSpeed: number): number {
  const cPeak =
    10 + 7 * v.camProfile + 0.8 * (f.valvesPerCylinder - 2) + (f.headType === 'ohv' ? -1.5 : 0);
  const width = 0.85 - 0.35 * v.camProfile + (v.vvt ? 0.15 : 0) + (v.vvl ? 0.15 : 0);
  // Grundniveau: scharfe Nocken (große Überschneidung) kosten Füllung bei niedriger Drehzahl.
  const floor = 0.82 - 0.3 * v.camProfile + (v.vvt ? 0.06 : 0);
  const ratio = Math.log(Math.max(pistonSpeed, 0.5) / cPeak);
  const x = ratio / (ratio > 0 ? 1.5 * width : width);
  return peakVolumetricEfficiency(f, v) * (floor + (1 - floor) * Math.exp(-x * x));
}

/**
 * Drosselverluste in Ansaugung und Abgasanlage: Strömungsverlust ~ (V̇/V̇_kapazität)².
 * Die Ansaugkapazität wird relativ zum Hubraum ausgelegt (Regler „Ansauggröße“), die Abgasseite
 * über den Rohrquerschnitt. V- und Boxermotoren ab 6 Zylindern haben zwei Abgasstränge.
 */
function flowRestriction(
  f: EngineFamily,
  v: EngineVariant,
  vd: number,
  airVolumeFlow: number,
  carb: boolean,
): number {
  const intakeCapacity = vd * (45 + 110 * v.intakeSize) * (carb ? 0.8 : 1); // m³/s
  const pipes = f.layout !== 'inline' && f.cylinders >= 6 ? 2 : 1;
  const exhaustArea = pipes * (Math.PI / 4) * v.exhaustDiameter * v.exhaustDiameter;
  const mufflerFactor = { none: 1.3, 'straight-through': 1.1, baffled: 0.9, 'reverse-flow': 0.75 }[
    v.muffler
  ];
  const catFactor = { none: 1.15, 'high-flow': 1.05, 'two-way': 1, 'three-way': 0.95 }[v.catalyst];
  const exhaustCapacity = exhaustArea * 95 * mufflerFactor * catFactor; // m³/s bei ~95 m/s
  const qi = airVolumeFlow / intakeCapacity;
  const qe = airVolumeFlow / exhaustCapacity;
  return 1 / (1 + 0.12 * qi * qi + 0.1 * qe * qe);
}

// ---------- Aufladung ----------

interface Charge {
  /** Absolutdruck im Saugrohr, Pa. */
  pressure: number;
  /** Ladelufttemperatur, K. */
  temperature: number;
  /** Antriebsleistung eines mechanischen Laders, W. */
  drivePower: number;
}

/**
 * Ladedruckaufbau. Turbo: Ansprechen über dem Abgas-Volumenstrom, ein kleiner Lader spricht
 * früh an und wird oben eng (Stopfgrenze). Kompressor: Roots/Schraube liefern früh vollen Druck,
 * Radialverdichter steigt quadratisch mit der Drehzahl.
 * Verdichtungstemperatur: T₂ = T₁ · (1 + (Π^((κ−1)/κ) − 1) / η_V)   (Heywood 1988, Gl. 6.6)
 */
function charge(v: EngineVariant, speed: number, nominalAirFlow: number, revLimit: number): Charge {
  const a = v.aspiration;
  if (a.kind === 'natural')
    return { pressure: P_AMBIENT, temperature: T_AMBIENT + 15, drivePower: 0 };

  const quality = v.aspirationQuality;
  let pr: number;
  let efficiency: number;
  let drivePower = 0;
  if (a.kind === 'turbo') {
    const prTarget = 1 + a.boost / P_AMBIENT;
    // Ansprechen: relative Abgasmenge ab der der Lader Druck aufbaut (größer = später).
    const spoolStart = (0.12 + 0.32 * a.size) / Math.pow(a.count, 0.35);
    const spoolFull = spoolStart * (1.9 - 0.2 * a.size);
    const flowRatio = speed / revLimit;
    pr = 1 + (prTarget - 1) * smoothstep((flowRatio - spoolStart) / (spoolFull - spoolStart));
    // Stopfgrenze: kleine Lader verlieren bei hoher Drehzahl Druck.
    const choke = 0.75 + 0.5 * a.size + 0.15 * (a.count - 1);
    if (flowRatio > choke) pr = 1 + (pr - 1) * Math.max(0.3, 1 - 2.5 * (flowRatio - choke));
    efficiency = 0.7 + 0.01 * quality;
  } else {
    const prTarget = 1 + a.boost / P_AMBIENT;
    const rise =
      a.type === 'centrifugal' ? Math.pow(speed / revLimit, 2) : smoothstep(speed / revLimit / 0.3);
    pr = 1 + (prTarget - 1) * rise;
    efficiency = { roots: 0.55, 'twin-screw': 0.68, centrifugal: 0.72 }[a.type] + 0.01 * quality;
  }

  const exponent = (GAMMA_AIR - 1) / GAMMA_AIR;
  const t1 = T_AMBIENT + 10;
  const t2 = t1 * (1 + (Math.pow(pr, exponent) - 1) / efficiency);
  const effectiveness = a.intercooler > 0 ? 0.45 + 0.45 * a.intercooler : 0;
  const temperature = t2 - effectiveness * (t2 - t1);
  const pressure =
    P_AMBIENT * pr - (a.intercooler > 0 ? 3_000 * (pr - 1) * (1.2 - a.intercooler) : 0);

  if (a.kind === 'supercharger') {
    // P = ṁ · c_p · (T₂ − T₁)
    const massFlow = (nominalAirFlow * pressure) / (R_AIR * temperature);
    drivePower = massFlow * 1005 * (t2 - t1);
  }
  return { pressure, temperature, drivePower };
}

// ---------- Wirkungsgrad, Klopfen, Reibung ----------

/**
 * Klopfgrenze (spielnah): erforderliche „Klopffestigkeit“ steigt mit Verdichtung,
 * Ladedruck, Ladelufttemperatur und frühem Zündzeitpunkt; Direkteinspritzung kühlt die Ladung.
 */
export function knockMargin(
  v: EngineVariant,
  chargePressure: number,
  chargeTemperature: number,
): number {
  const fuel = FUELS[v.fuel];
  if (!Number.isFinite(fuel.knockLimitCr)) return Infinity;
  const pr = chargePressure / P_AMBIENT;
  const demand =
    v.compressionRatio *
    Math.pow(pr, 0.3) *
    Math.pow(chargeTemperature / (T_AMBIENT + 15), 0.8) *
    (1 + 0.12 * (v.ignitionTiming - 0.5)) *
    (v.lambda < 0.9 ? 1 - 0.3 * (0.9 - v.lambda) : 1);
  const limit =
    fuel.knockLimitCr +
    (v.fuelSystem === 'direct' ? 1.0 : 0) +
    (v.vvt ? 0.2 : 0) +
    0.05 * v.fuelQuality;
  return limit - demand;
}

/**
 * Innerer Wirkungsgrad: Gleichraum- bzw. Seiliger-Prozess mit κ = 1,3 (Heywood 1988, Gl. 5.31),
 * Gütegrad 0,8 für reale Verluste; Zündzeitpunkt, Gemisch und Klopfrücknahme als Faktoren.
 */
function indicatedEfficiency(v: EngineVariant, margin: number, speed = 0): number {
  const kappa = 1.3;
  const diesel = v.fuel === 'diesel';
  const ideal = 1 - Math.pow(v.compressionRatio, 1 - kappa) * (diesel ? 1.08 : 1);
  const timing = 1 - 0.09 * Math.pow(1 - v.ignitionTiming, 2);
  // Ottomotor: Umsetzungsgrad sinkt bei fettem Gemisch (unvollständige Verbrennung),
  // leicht mageres Gemisch verbessert den Wirkungsgrad. Leistungsmaximum damit bei λ ≈ 0,9.
  const rich = 1 - v.lambda;
  const mixture = diesel
    ? 1
    : rich > 0
      ? 1 - 0.6 * rich - 2.5 * rich * rich
      : 1 + 0.25 * Math.min(-rich, 0.2);
  const knock = margin < 0 ? Math.max(0.7, 1 + 0.06 * margin) : 1;
  const system = {
    carburetor: 0.95,
    'single-point': 0.97,
    'multi-point': 1,
    direct: 1.02,
    'diesel-indirect': 0.93,
    'common-rail': 1,
  }[v.fuelSystem];
  // Diesel: Die Verbrennungsdauer ist zeitlich weitgehend fest, bei hoher Drehzahl verbrennt
  // ein wachsender Teil zu spät (Wirkungsgradverlust ~ n²).
  const combustion = diesel ? 1 - 0.012 * Math.pow((speed * 30) / Math.PI / 1000, 2) : 1;
  return 0.8 * ideal * timing * mixture * knock * system * combustion;
}

/**
 * Reibmitteldruck nach Barnes-Moss (Heywood 1988, Gl. 13.20):
 *   FMEP [bar] = 0,97 + 0,15 · (n/1000) + 0,05 · (n/1000)²,  n in 1/min
 * skaliert über die Kolbengeschwindigkeit auf andere Hub-Bohrungs-Verhältnisse; Faktoren für
 * Ventiltrieb, Kolben und Diesel. Faktor 0,7: moderne Motoren liegen rund 30 % unter dem
 * Datensatz der 1970er-Jahre, auf dem die Korrelation beruht.
 */
function frictionMeanPressure(f: EngineFamily, v: EngineVariant, speed: number): number {
  const rpmEquivalent = (meanPistonSpeed(v.stroke, speed) / (2 * 0.0864)) * 60; // Referenzhub 86,4 mm
  const k = rpmEquivalent / 1000;
  const base = (0.97 + 0.15 * k + 0.05 * k * k) * 1e5;
  const valvetrain = { ohv: 0.95, sohc: 1, dohc: 1.04 }[f.headType] + (v.vvl ? 0.02 : 0);
  const pistons = { cast: 1, hypereutectic: 0.97, forged: 1.02, 'low-friction': 0.9 }[v.pistons];
  const diesel = v.fuel === 'diesel' ? 1.25 : 1;
  return 0.7 * base * valvetrain * pistons * diesel * (1 - 0.01 * v.bottomEndQuality);
}

// ---------- Kurve ----------

/** Berechnet die Volllastkurve vom Leerlauf bis zum Drehzahlbegrenzer. */
export function engineCurve({ family: f, variant: v }: EngineInput, steps = 64): EngineCurve {
  const vd = displacement(f, v);
  const fuel = FUELS[v.fuel];
  const idle = (800 * TWO_PI) / 60;
  const carb = v.fuelSystem === 'carburetor';
  const points: CurvePoint[] = [];
  let minMargin = Infinity;

  for (let i = 0; i <= steps; i++) {
    const speed = idle + ((v.revLimit - idle) * i) / steps;
    const pistonSpeed = meanPistonSpeed(v.stroke, speed);
    const nominalAirFlow = (vd * speed) / (4 * Math.PI); // m³/s, Viertakt
    const c = charge(v, speed, nominalAirFlow, v.revLimit);
    const density = c.pressure / (R_AIR * c.temperature);
    const margin = knockMargin(v, c.pressure, c.temperature);
    minMargin = Math.min(minMargin, margin);

    // Volumenstrom bezogen auf Umgebungszustand (aufgeladen entsprechend größer).
    const ambientFlow = nominalAirFlow * (c.pressure / P_AMBIENT) * (T_AMBIENT / c.temperature);
    const ve =
      volumetricEfficiency(f, v, pistonSpeed) * flowRestriction(f, v, vd, ambientFlow, carb);
    const etaI = indicatedEfficiency(v, margin, speed);
    // Diesel: Leistung über Mindest-Lambda (Rauchgrenze) begrenzt; Otto: Volllast-Lambda.
    const fuelPerAir = 1 / (fuel.afrStoich * v.lambda);
    const imep = etaI * ve * density * fuel.lhv * fuelPerAir;
    const fmep = frictionMeanPressure(f, v, speed) + (c.drivePower * 4 * Math.PI) / (vd * speed);
    // Ladungswechselverlust durch den Abgasgegendruck der Turbine (spielnahe Kalibrierung).
    const pmep = v.aspiration.kind === 'turbo' ? 0.08 * (c.pressure - P_AMBIENT) : 0;
    const bmep = Math.max(0, imep - fmep - pmep);
    const torque = (bmep * vd) / (4 * Math.PI);
    const airFlow = ve * density * nominalAirFlow;
    const fuelFlow = airFlow * fuelPerAir;
    const power = torque * speed;
    points.push({
      speed,
      torque,
      power,
      boost: c.pressure - P_AMBIENT,
      volumetricEfficiency: ve,
      efficiency: fuelFlow > 0 ? power / (fuelFlow * fuel.lhv) : 0,
      fuelFlow,
    });
  }

  const peakPower = points.reduce((a, b) => (b.power > a.power ? b : a));
  const peakTorque = points.reduce((a, b) => (b.torque > a.torque ? b : a));
  return {
    points,
    peakPower: { power: peakPower.power, speed: peakPower.speed },
    peakTorque: { torque: peakTorque.torque, speed: peakTorque.speed },
    peakBoost: Math.max(...points.map((p) => p.boost)),
    knockMargin: minMargin,
  };
}

/**
 * Teillast-Wirkungsgrad bei gegebener Drehzahl und Leistungsbedarf (für den Verbrauch):
 *   η_e = η_i · BMEP / (BMEP + FMEP + PMEP_Drossel)
 * Drosselverluste beim Ottomotor ~ 0,4 bar bei niedriger Last (Heywood 1988, Abb. 13.8).
 */
export function partLoadEfficiency(
  { family: f, variant: v }: EngineInput,
  speed: number,
  power: number,
): number {
  if (power <= 0 || speed <= 0) return 0;
  const vd = displacement(f, v);
  const bmep = (power * 4 * Math.PI) / (vd * speed);
  const fmep = frictionMeanPressure(f, v, speed);
  const throttle = v.fuel === 'diesel' ? 0.05e5 : 0.4e5 * Math.max(0, 1 - bmep / 8e5);
  const etaI = indicatedEfficiency(
    { ...v, lambda: v.fuel === 'diesel' ? 2 : 1, ignitionTiming: Math.max(v.ignitionTiming, 0.8) },
    1,
    speed,
  );
  // Teillast: Ottomotor verliert durch Restgas und Wandwärme, der magere Diesel gewinnt durch
  // den höheren Isentropenexponenten des Luftüberschusses (Heywood 1988, Kap. 5.5).
  const partLoad = v.fuel === 'diesel' ? 1.08 : 0.92;
  return (partLoad * etaI * bmep) / (bmep + fmep + throttle);
}
