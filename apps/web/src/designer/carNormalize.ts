import {
  type Battery,
  type Car,
  ENGINE_TEMPLATES,
  type ElectricMotor,
  type MotorPosition,
  type PowertrainType,
  carEngineFrom,
} from '@ericmotors/schema';

/** Geometrische Gangabstufung zwischen erstem und letztem Gang (gängige Auslegungsregel). */
export function spreadRatios(first: number, last: number, count: number): number[] {
  if (count < 2) return [first];
  const step = Math.pow(last / first, 1 / (count - 1));
  return Array.from(
    { length: count },
    (_, i) => Math.round(first * Math.pow(step, i) * 1000) / 1000,
  );
}

/** Hält abhängige Werte des Autos nach einer Änderung stimmig. */
export function normalizeCar(car: Car, changedPath: string): void {
  const dt = car.drivetrain;
  if (changedPath === 'drivetrain.gearbox') {
    const first = dt.ratios[0]!;
    const last = dt.ratios.at(-1)!;
    if (dt.gearbox === 'cvt') dt.ratios = [Math.max(first, 2.5), Math.min(last, 0.5)];
    else if (dt.ratios.length === 2)
      dt.ratios = spreadRatios(first, Math.max(last, 0.6), dt.gearbox === 'automatic' ? 8 : 6);
  }
  // Übersetzungen streng absteigend halten.
  for (let i = 1; i < dt.ratios.length; i++) {
    if (dt.ratios[i]! >= dt.ratios[i - 1]!)
      dt.ratios[i] = Math.max(0.3, Math.round((dt.ratios[i - 1]! - 0.01) * 1000) / 1000);
  }
  if (changedPath.startsWith('powertrain.')) normalizePowertrain(car, changedPath);
  const d = car.model.dimensions;
  d.wheelbase = Math.min(d.wheelbase, d.length - d.overhangFront - 0.3);
  if (car.model.shape === 'roadster') car.trim.seats = Math.min(car.trim.seats, 2);
}

/** Setzt die Anzahl der Gänge und verteilt die Übersetzungen neu. */
export function setGearCount(car: Car, count: number): void {
  const r = car.drivetrain.ratios;
  car.drivetrain.ratios = spreadRatios(r[0]!, r.at(-1)!, count);
}

const rpm = (n: number) => (n * Math.PI) / 30;
const KWH = 3.6e6;

/** Sinnvolle Startwerte eines E-Motors je Einbauort. */
export function defaultMotor(position: MotorPosition): ElectricMotor {
  const base = { id: position, position, count: 1, cooling: 'liquid', quality: 0 } as const;
  if (position === 'gearbox')
    return { ...base, type: 'pmsm', peakPower: 80e3, maxSpeed: rpm(7_000), reduction: 9 };
  if (position === 'front')
    return { ...base, type: 'induction', peakPower: 150e3, maxSpeed: rpm(16_000), reduction: 9 };
  return { ...base, type: 'pmsm', peakPower: 200e3, maxSpeed: rpm(16_000), reduction: 9 };
}

/** Startbatterie: Elektroauto 75 kWh, Plug-in 13 kWh, Vollhybrid 1,5 kWh (Leistungszellen). */
export function defaultBattery(type: PowertrainType, plugIn: boolean): Battery {
  if (type === 'electric')
    return {
      chemistry: 'nmc',
      cells: 'balanced',
      capacity: 75 * KWH,
      voltage: '400V',
      cooling: 'liquid',
      quality: 0,
    };
  return {
    chemistry: 'nmc',
    cells: 'power',
    capacity: (plugIn ? 13 : 1.5) * KWH,
    voltage: '400V',
    cooling: plugIn ? 'liquid' : 'air',
    quality: 0,
  };
}

/** Antriebsart der Achsen aus der Lage der E-Motoren (nur Elektroauto). */
export function layoutFromMotors(car: Car): Car['drivetrain']['layout'] {
  const pos = new Set(car.powertrain.motors.map((m) => m.position));
  return pos.has('front') && pos.has('rear') ? 'awd' : pos.has('front') ? 'fwd' : 'rwd';
}

/**
 * Wechselt die Antriebsart und ergänzt bzw. entfernt Bauteile so, dass das Auto gültig bleibt.
 * Ein fehlender Verbrenner wird aus der Vorlage „1.6 Reihenvierer“ eingesetzt.
 */
export function setPowertrainType(car: Car, type: PowertrainType): void {
  const pt = car.powertrain;
  if (pt.type === type) return;
  const ensureEngine = () => {
    pt.engine ??= carEngineFrom(ENGINE_TEMPLATES['i4-16-na'](), 'front-transverse');
  };
  const fromElectric = pt.type === 'electric';
  pt.type = type;
  // Vom Elektroauto kommend: Antriebsachse passend zur Einbaulage des Verbrenners wählen.
  const engineLayout = () => {
    if (fromElectric)
      car.drivetrain.layout = pt.engine!.placement === 'front-transverse' ? 'fwd' : 'rwd';
  };
  if (type === 'ice') {
    ensureEngine();
    engineLayout();
    pt.motors = [];
    delete pt.battery;
    delete pt.hybrid;
  } else if (type === 'electric') {
    delete pt.engine;
    delete pt.hybrid;
    pt.motors = pt.motors.filter((m) => m.position !== 'gearbox');
    if (pt.motors.length === 0) pt.motors = [defaultMotor('rear')];
    if (!pt.battery || pt.battery.capacity < 20 * KWH)
      pt.battery = defaultBattery('electric', false);
    car.drivetrain.layout = layoutFromMotors(car);
  } else {
    ensureEngine();
    engineLayout();
    pt.hybrid = { plugIn: true };
    // Parallelhybrid mit E-Motor am Getriebe („P2“); weitere Achsmotoren lassen sich ergänzen.
    pt.motors = [defaultMotor('gearbox')];
    pt.battery = defaultBattery('hybrid', true);
  }
}

/** Freie Einbauorte für einen weiteren E-Motor (je Ort höchstens einer). */
export function freeMotorPositions(car: Car): MotorPosition[] {
  const used = new Set(car.powertrain.motors.map((m) => m.position));
  const all: MotorPosition[] =
    car.powertrain.type === 'hybrid' ? ['gearbox', 'front', 'rear'] : ['front', 'rear'];
  return car.powertrain.type === 'ice' ? [] : all.filter((p) => !used.has(p));
}

export function addMotor(car: Car, position: MotorPosition): void {
  if (!freeMotorPositions(car).includes(position)) return;
  car.powertrain.motors.push(defaultMotor(position));
  if (car.powertrain.type === 'electric') car.drivetrain.layout = layoutFromMotors(car);
}

export function removeMotor(car: Car, index: number): void {
  if (car.powertrain.motors.length <= 1) return;
  car.powertrain.motors.splice(index, 1);
  if (car.powertrain.type === 'electric') car.drivetrain.layout = layoutFromMotors(car);
}

function normalizePowertrain(car: Car, path: string): void {
  const pt = car.powertrain;
  for (const m of pt.motors) {
    if (m.position === 'gearbox') m.count = 1;
    m.id = m.position;
  }
  // Einbauort geändert: doppelte Orte vermeiden, indem der andere Motor den frei gewordenen Ort erhält.
  const match = /^powertrain\.motors\.(\d+)\.position$/.exec(path);
  if (match) {
    const i = Number(match[1]);
    const moved = pt.motors[i]!;
    const free = (['front', 'rear', 'gearbox'] as const).find(
      (p) => !pt.motors.some((m) => m.position === p) && (p !== 'gearbox' || pt.type === 'hybrid'),
    );
    pt.motors.forEach((m, j) => {
      if (j !== i && m.position === moved.position && free) {
        m.position = free;
        m.id = free;
        if (free === 'gearbox') m.count = 1;
      }
    });
  }
  if (path === 'powertrain.hybrid.plugIn' && pt.battery && pt.hybrid) {
    const kwh = pt.battery.capacity / KWH;
    if (pt.hybrid.plugIn && kwh < 6) pt.battery = defaultBattery('hybrid', true);
    if (!pt.hybrid.plugIn && kwh > 4) pt.battery = defaultBattery('hybrid', false);
  }
  if (pt.type === 'electric') car.drivetrain.layout = layoutFromMotors(car);
}
