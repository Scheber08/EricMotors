import type { Car, ElectricMotor } from '@ericmotors/schema';
import { FUELS } from '../constants';
import { BATTERY_EFFICIENCY, chargeTime10to80 } from '../electric/battery';
import { motorEfficiency, unitPeakPower } from '../electric/motor';
import type { EngineAnalysis } from '../engine/analyze';
import { partLoadEfficiency } from '../engine/curve';
import { type DriveUnit, REDUCTION_EFFICIENCY, torqueAt } from './drive';
import type { CarGeometry } from './geometry';

/**
 * Verbrauch im Mischzyklus (spielnah, an WLTP angelehnt): 35 % Stadt (50 km/h, 1,2 Stopps/km,
 * 15 % Standzeit), 40 % Land (90 km/h), 25 % Autobahn (120 km/h). docs/MODELS.md § Verbrauch.
 */
export interface Consumption {
  /** Kraftstoff, m³/m (× 1e8 = l/100 km); 0 beim Elektroauto. */
  fuelPerDistance: number;
  /** Strom aus dem Netz inkl. Ladeverlusten, J/m (÷ 36 = kWh/100 km); 0 beim Verbrenner. */
  electricPerDistance: number;
  /** CO₂ am Auspuff, kg/m (× 1e6 = g/km). */
  co2PerDistance: number;
  /** Gesamtreichweite, m. */
  range: number;
  /** Elektrische Reichweite, m (null ohne Batterie mit nennenswerter Kapazität). */
  electricRange: number | null;
  /** Schnellladen 10 → 80 %, s (null ohne Ladeanschluss). */
  chargeTime: number | null;
}

interface Context {
  car: Car;
  geometry: CarGeometry;
  units: DriveUnit[];
  engine: EngineAnalysis | undefined;
  testMass: number;
  resistance: (v: number) => number;
  radius: (u: DriveUnit) => number;
}

const KMH = 1 / 3.6;
const rpm = (n: number) => (n * Math.PI) / 30;
const URBAN = 50 * KMH;
const STOPS_PER_METER = 1.2 / 1000;
const MIX = { urban: 0.35, rural: 0.4, motorway: 0.25 } as const;
/** Ladeverluste Netz → Batterie. */
const CHARGING_LOSS = 1.1;
/** Anteil der Bremsenergie, den die Rekuperation zurückgewinnt (Rad → Batterie). */
const REGEN_SHARE = 0.65;

function accessoryPower(car: Car, electric: boolean): number {
  const ent = { none: 0, radio: 20, infotainment: 60, 'premium-infotainment': 150 }[
    car.trim.entertainment
  ];
  return (electric ? 450 : 600) + ent;
}

/** Verbrenner: Kraftstoffmasse je Meter für die drei Zyklusanteile. */
function iceFuel(ctx: Context, hybridStartStop: boolean) {
  const { car, units, engine, testMass: m, resistance, radius } = ctx;
  const u = units.find((x) => x.kind === 'engine' || x.kind === 'hybrid')!;
  const pt = car.powertrain;
  const variant = pt.engine!.variant;
  const curve = engine!.curve;
  const fuel = FUELS[variant.fuel];
  const engineInput = { family: pt.engine!.family, variant };
  const r = radius(u);
  const eta = u.efficiency;
  const minCruise = variant.fuel === 'diesel' ? rpm(1200) : rpm(1300);
  const accessory = accessoryPower(car, false);

  const steady = (speed: number) => {
    const power = (resistance(speed) * speed) / eta + accessory;
    let omega: number;
    if (u.cvt) {
      omega = Math.max(minCruise, Math.min((speed / r) * u.ratios[0]!, rpm(2500)));
    } else {
      // Höchster Gang, in dem die Drehzahl reicht und genug Reserve bleibt.
      const options = [...u.ratios].reverse();
      omega = (speed / r) * u.ratios[0]!;
      for (const ratio of options) {
        const o = (speed / r) * ratio;
        if (o >= minCruise && torqueAt(curve, o) * o * 0.8 >= power && o <= u.maxSpeed) {
          omega = o;
          break;
        }
      }
    }
    const efficiency = Math.max(0.05, partLoadEfficiency(engineInput, omega, power));
    return power / (efficiency * fuel.lhv * speed); // kg/m
  };
  const accelEfficiency = Math.max(
    0.1,
    partLoadEfficiency(engineInput, rpm(2500), Math.min(30e3, 0.5 * curve.peakPower.power)),
  );
  const accelFuel =
    (STOPS_PER_METER * 0.5 * m * 1.1 * URBAN * URBAN) / (accelEfficiency * eta * fuel.lhv);
  const liters = engine!.displacement * 1000;
  const idleFuel = hybridStartStop ? 0 : (7.8e-5 * liters * 0.15 * 72) / 1000; // 15 % Standzeit bei 72 s/km
  // Instationärzuschlag 1,1 für Beschleunigungen außerhalb der Stadt, Kaltstart und Fahrprofil.
  return {
    urban: 1.1 * (steady(URBAN) + accelFuel + idleFuel),
    rural: 1.1 * steady(90 * KMH),
    motorway: 1.1 * steady(120 * KMH),
    fuel,
  };
}

/** Elektrisch fahren: Energie aus der Batterie je Meter für die drei Zyklusanteile, J/m. */
function electricEnergy(ctx: Context) {
  const { car, units, testMass: m, resistance, radius } = ctx;
  const pt = car.powertrain;
  const accessory = accessoryPower(car, true);
  const gearboxUnit = units.find((x) => x.kind === 'hybrid');
  // Betriebspunkte der Motoren: Achsmotoren über ihre Untersetzung, Getriebe-E-Motor über einen mittleren Gang.
  const options = pt.motors.map((mo: ElectricMotor) => {
    if (mo.position === 'gearbox' && gearboxUnit) {
      const ratio = gearboxUnit.ratios[Math.min(3, gearboxUnit.ratios.length - 1)]!;
      return { mo, ratio, chain: gearboxUnit.efficiency, r: radius(gearboxUnit) };
    }
    const unit = units.find((x) => x.id === `motor-${mo.id}`)!;
    return { mo, ratio: mo.reduction, chain: REDUCTION_EFFICIENCY, r: radius(unit) };
  });
  /** Bester Wirkungsgrad Batterie → Rad über alle Motoren bei Geschwindigkeit und Leistung. */
  const chainEfficiency = (speed: number, power: number) =>
    Math.max(
      0.5,
      ...options.map(({ mo, ratio, chain, r }) => {
        const omega = Math.min(mo.maxSpeed, (speed / r) * ratio);
        return (
          chain *
          motorEfficiency(mo, omega, Math.min(power, unitPeakPower(mo))) *
          BATTERY_EFFICIENCY
        );
      }),
    );
  const steady = (speed: number) => {
    const wheel = resistance(speed) * speed;
    return (wheel / chainEfficiency(speed, wheel) + accessory) / speed;
  };
  const kinetic = 0.5 * m * 1.05 * URBAN * URBAN;
  const eta = chainEfficiency(URBAN, 30e3);
  const accel = STOPS_PER_METER * (kinetic / eta - REGEN_SHARE * kinetic * eta);
  const idle = (accessory * 0.15 * 72) / 1000;
  return {
    // Kleiner Instationärzuschlag: Rekuperation fängt den Großteil der Lastwechsel ab.
    urban: 1.03 * (steady(URBAN) + accel + idle),
    rural: 1.03 * steady(90 * KMH),
    motorway: 1.03 * steady(120 * KMH),
  };
}

const mix = (x: { urban: number; rural: number; motorway: number }) =>
  MIX.urban * x.urban + MIX.rural * x.rural + MIX.motorway * x.motorway;

export function computeConsumption(ctx: Context): Consumption {
  const { car, geometry: g } = ctx;
  const pt = car.powertrain;
  const battery = pt.battery;

  if (pt.type === 'electric') {
    const perMeter = mix(electricEnergy(ctx)); // J/m aus der Batterie
    return {
      fuelPerDistance: 0,
      electricPerDistance: perMeter * CHARGING_LOSS,
      co2PerDistance: 0,
      range: (0.95 * battery!.capacity) / perMeter,
      electricRange: (0.95 * battery!.capacity) / perMeter,
      chargeTime: chargeTime10to80(battery!),
    };
  }

  const hybrid = pt.type === 'hybrid';
  const ice = iceFuel(ctx, hybrid);
  let fuelMass = ice;
  if (hybrid) {
    // Parallelhybrid: Rekuperation, elektrisches Anfahren/Kriechen und Lastpunktverschiebung sparen
    // abhängig von der E-Leistung (ab 30 kW voller Effekt), am meisten in der Stadt.
    const h = Math.min(1, pt.motors.reduce((a, mo) => a + unitPeakPower(mo), 0) / 30e3);
    fuelMass = {
      ...ice,
      urban: ice.urban * (1 - 0.4 * h),
      rural: ice.rural * (1 - 0.12 * h),
      motorway: ice.motorway * (1 - 0.05 * h),
    };
  }
  const kgPerMeter = mix(fuelMass);
  let fuelPerDistance = kgPerMeter / ice.fuel.density;
  let electricPerDistance = 0;
  let electricRange: number | null = null;
  let chargeTime: number | null = null;
  let range = g.tankVolume / fuelPerDistance;

  if (hybrid && pt.hybrid?.plugIn && battery) {
    const ev = mix(electricEnergy(ctx));
    electricRange = (0.9 * battery.capacity) / ev;
    // Gewichtung nach Nutzfaktor (Anteil elektrisch gefahrener Strecke), Näherung der WLTP-Kurve.
    const uf = 1 - Math.exp(-electricRange / 40_000);
    electricPerDistance = uf * ev * CHARGING_LOSS;
    range = range + electricRange;
    fuelPerDistance *= 1 - uf;
    chargeTime = chargeTime10to80(battery);
  }

  return {
    fuelPerDistance,
    electricPerDistance,
    co2PerDistance: fuelPerDistance * ice.fuel.density * ice.fuel.co2PerKg,
    range,
    electricRange,
    chargeTime,
  };
}
