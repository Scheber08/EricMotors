import type { Car } from '@ericmotors/schema';

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
  const d = car.model.dimensions;
  d.wheelbase = Math.min(d.wheelbase, d.length - d.overhangFront - 0.3);
  if (car.model.shape === 'roadster') car.trim.seats = Math.min(car.trim.seats, 2);
}

/** Setzt die Anzahl der Gänge und verteilt die Übersetzungen neu. */
export function setGearCount(car: Car, count: number): void {
  const r = car.drivetrain.ratios;
  car.drivetrain.ratios = spreadRatios(r[0]!, r.at(-1)!, count);
}
