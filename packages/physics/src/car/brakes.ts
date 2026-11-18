import type { Car } from '@ericmotors/schema';

/**
 * Bremsen-Standfestigkeit: Wie viele Vollbremsungen aus 100 km/h hintereinander bis zur
 * Fading-Temperatur? Wärmekapazität der Scheiben nach Masse und Werkstoff, Kühlung zwischen den
 * Bremsungen je nach Bauart (spielnah).
 *   ΔT pro Stopp = E_Achse / (m_Scheiben · c)
 */
const C_IRON = 460; // J/(kg·K), Grauguss
const C_CCM = 800; // J/(kg·K), Carbon-Keramik

/** Masse einer Bremsscheibe bzw. Trommel, kg. */
export function discMass(b: Car['brakes']['front']): number {
  return (
    { drum: 7, 'solid-disc': 5, 'vented-disc': 7, 'carbon-ceramic': 3.5 }[b.type] *
    Math.pow(b.diameter / 0.3, 2)
  );
}

export function fadeStops(car: Car, testMass: number): number {
  const v = 100 / 3.6;
  const energy = 0.5 * testMass * v * v;
  const axle = (b: Car['brakes']['front'], share: number) => {
    const ccm = b.type === 'carbon-ceramic';
    const capacity = 2 * discMass(b) * (ccm ? C_CCM : C_IRON);
    const fadeT =
      (ccm ? 900 : b.type === 'drum' ? 350 : 550) +
      (car.brakes.pads === 'race' ? 100 : car.brakes.pads === 'organic' ? -80 : 0);
    const cooling = { drum: 0.15, 'solid-disc': 0.3, 'vented-disc': 0.45, 'carbon-ceramic': 0.5 }[
      b.type
    ];
    const rise = (energy * share) / capacity;
    return (fadeT - 100) / (rise * (1 - cooling));
  };
  const n = Math.min(
    axle(car.brakes.front, car.brakes.bias),
    axle(car.brakes.rear, 1 - car.brakes.bias),
  );
  return Math.max(0, Math.floor(n * (1 + 0.03 * car.brakes.quality)));
}
