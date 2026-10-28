import { ASPHALT, GRASS, type Surface } from './vehicle';

/**
 * Teststrecke als geschlossene Mittellinie (Catmull-Rom-Spline durch Stützpunkte), dazu
 * Ortung des Autos auf der Strecke und Rundenzeitmessung. ISO-Koordinaten in der Ebene, m.
 */

export interface TrackDef {
  id: string;
  /** Fahrbahnbreite, m. */
  width: number;
  /** Stützpunkte der Mittellinie in Fahrtrichtung; der erste liegt auf der Ziellinie. */
  points: readonly (readonly [number, number])[];
}

export interface TrackPoint {
  x: number;
  y: number;
  /** Einheitstangente in Fahrtrichtung. */
  tx: number;
  ty: number;
  /** Bogenlänge ab der Ziellinie, m. */
  s: number;
  /** Krümmung, 1/m (> 0 Linkskurve). */
  curvature: number;
}

export interface Track {
  id: string;
  width: number;
  length: number;
  points: TrackPoint[];
}

/** Rundkurs mit langer Geraden, Haarnadel, Schikane und schneller Links. */
export const TEST_TRACK: TrackDef = {
  id: 'test-circuit',
  width: 12,
  points: [
    [0, 0],
    [250, 0],
    [475, 12],
    [550, 75],
    [538, 175],
    [450, 212],
    [375, 188],
    [312, 238],
    [325, 325],
    [250, 400],
    [125, 412],
    [25, 362],
    [-75, 375],
    [-175, 325],
    [-212, 225],
    [-162, 138],
    [-200, 50],
    [-125, 0],
  ],
};

const catmull = (p0: number, p1: number, p2: number, p3: number, t: number) =>
  0.5 *
  (2 * p1 +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);

/** Tastet die Mittellinie etwa alle `spacing` Meter ab. */
export function buildTrack(def: TrackDef, spacing = 2): Track {
  const n = def.points.length;
  const raw: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const p0 = def.points[(i - 1 + n) % n]!;
    const p1 = def.points[i]!;
    const p2 = def.points[(i + 1) % n]!;
    const p3 = def.points[(i + 2) % n]!;
    const steps = Math.max(4, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / spacing));
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      raw.push([catmull(p0[0], p1[0], p2[0], p3[0], t), catmull(p0[1], p1[1], p2[1], p3[1], t)]);
    }
  }
  const m = raw.length;
  const points: TrackPoint[] = [];
  let s = 0;
  for (let i = 0; i < m; i++) {
    const prev = raw[(i - 1 + m) % m]!;
    const cur = raw[i]!;
    const next = raw[(i + 1) % m]!;
    const dx = next[0] - prev[0];
    const dy = next[1] - prev[1];
    const len = Math.hypot(dx, dy) || 1;
    // Krümmung aus dem Winkel zwischen den Nachbarsegmenten.
    const a1 = Math.atan2(cur[1] - prev[1], cur[0] - prev[0]);
    const a2 = Math.atan2(next[1] - cur[1], next[0] - cur[0]);
    let da = a2 - a1;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    points.push({ x: cur[0], y: cur[1], tx: dx / len, ty: dy / len, s, curvature: (2 * da) / len });
    s += Math.hypot(next[0] - cur[0], next[1] - cur[1]);
  }
  return { id: def.id, width: def.width, length: s, points };
}

export interface TrackLocation {
  /** Index des nächsten Stützpunkts. */
  index: number;
  /** Bogenlänge ab der Ziellinie, m. */
  s: number;
  /** Seitlicher Abstand zur Mittellinie, m (> 0 links). */
  offset: number;
}

/**
 * Nächster Punkt der Mittellinie. Mit `hint` (Index aus dem letzten Bild) wird nur ein Fenster
 * durchsucht, sonst die ganze Strecke.
 */
export function locate(track: Track, x: number, y: number, hint?: number): TrackLocation {
  const pts = track.points;
  const n = pts.length;
  let best = 0;
  let bestD = Infinity;
  const scan = (i: number) => {
    const p = pts[((i % n) + n) % n]!;
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = ((i % n) + n) % n;
    }
  };
  if (hint === undefined) for (let i = 0; i < n; i++) scan(i);
  else for (let i = hint - 40; i <= hint + 40; i++) scan(i);
  // Fenstersuche verloren (z. B. quer über die Wiese abgekürzt): vollständig suchen.
  if (hint !== undefined && bestD > (track.width * 3) ** 2) return locate(track, x, y);
  const p = pts[best]!;
  const along = (x - p.x) * p.tx + (y - p.y) * p.ty;
  const offset = -(x - p.x) * p.ty + (y - p.y) * p.tx;
  const s = (((p.s + along) % track.length) + track.length) % track.length;
  return { index: best, s, offset };
}

/** Breite der Randsteine beiderseits der Fahrbahn, m. */
export const KERB_WIDTH = 1.2;

export function surfaceAt(track: Track, loc: TrackLocation): Surface {
  return Math.abs(loc.offset) <= track.width / 2 + KERB_WIDTH ? ASPHALT : GRASS;
}

/** Startaufstellung: hinter der Ziellinie, in Fahrtrichtung. */
export function startPose(track: Track, behind = 12): { x: number; y: number; heading: number } {
  const p = track.points[0]!;
  return { x: p.x - p.tx * behind, y: p.y - p.ty * behind, heading: Math.atan2(p.ty, p.tx) };
}

export interface LapState {
  /** Zeitpunkt der letzten Zieldurchfahrt, s (null vor der ersten). */
  lapStart: number | null;
  lastLap: number | null;
  bestLap: number | null;
  laps: number;
  /** Streckenhälfte erreicht: nur dann zählt die nächste Zieldurchfahrt als Runde. */
  halfway: boolean;
  /** Bogenlänge im letzten Schritt, m. */
  lastS: number | null;
}

export const initialLapState = (): LapState => ({
  lapStart: null,
  lastLap: null,
  bestLap: null,
  laps: 0,
  halfway: false,
  lastS: null,
});

/** Aktualisiert die Rundenzeitmessung nach einem Schritt (Zeit `time`, Lage `s`). */
export function updateLap(state: LapState, s: number, time: number, length: number): LapState {
  const prev = state.lastS;
  const next = { ...state, lastS: s };
  if (prev === null) return next;
  const forward = prev > 0.75 * length && s < 0.25 * length;
  const backward = prev < 0.25 * length && s > 0.75 * length;
  if (s > 0.4 * length && s < 0.6 * length) next.halfway = true;
  if (backward) next.halfway = false;
  if (!forward) return next;
  if (state.lapStart === null) return { ...next, lapStart: time, halfway: false };
  if (!state.halfway) return { ...next, lapStart: time };
  const lap = time - state.lapStart;
  return {
    ...next,
    lapStart: time,
    lastLap: lap,
    bestLap: state.bestLap === null ? lap : Math.min(state.bestLap, lap),
    laps: state.laps + 1,
    halfway: false,
  };
}

/** Deterministischer Zufall (Mulberry32) für reproduzierbare Kulissen. */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Bäume neben der Strecke mit Mindestabstand zur Fahrbahn. */
export function scenery(
  track: Track,
  count = 140,
  seed = 7,
): { x: number; y: number; scale: number }[] {
  const rnd = random(seed);
  const xs = track.points.map((p) => p.x);
  const ys = track.points.map((p) => p.y);
  const [x0, x1] = [Math.min(...xs) - 120, Math.max(...xs) + 120];
  const [y0, y1] = [Math.min(...ys) - 120, Math.max(...ys) + 120];
  const out: { x: number; y: number; scale: number }[] = [];
  for (let tries = 0; out.length < count && tries < count * 20; tries++) {
    const x = x0 + rnd() * (x1 - x0);
    const y = y0 + rnd() * (y1 - y0);
    const loc = locate(track, x, y);
    if (Math.abs(loc.offset) < track.width / 2 + 18) continue;
    // Der seitliche Abstand täuscht in engen Kurven; zusätzlich den echten Abstand prüfen.
    const p = track.points[loc.index]!;
    if (Math.hypot(p.x - x, p.y - y) < track.width / 2 + 18) continue;
    out.push({ x, y, scale: 0.7 + rnd() * 0.8 });
  }
  return out;
}
