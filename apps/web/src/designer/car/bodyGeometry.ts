import type { BodyShape, Car } from '@ericmotors/schema';

/**
 * Parametrische Karosserie als Loft aus Querschnitten (reine Funktion, ohne three.js).
 *
 * Koordinaten nach ISO 8855 in m: x nach vorn (Vorderachse bei x = 0), y nach links, z nach oben.
 * Der Viewer rechnet in three.js-Koordinaten um (x → x, z → y, y → −z).
 *
 * Aufbau:
 *  - Seitenprofil (Oberkante) aus Grundform und Form-Reglern: Nase → Haube → Windschutzscheibe →
 *    Dach → Heckscheibe → Heckdeckel → Heck, mit einem Gauß-Filter zu weichen Übergängen geglättet.
 *  - Draufsicht: gerade Flanken mit elliptisch gerundeten Ecken an Front und Heck und
 *    ausgestellten Radhäusern.
 *  - Unterbau („lower“): vom Boden bis min(Profil, Gürtellinie) mit Schweller, Flanke, gerundeter
 *    Schulter und gewölbter Haube; Radhausausschnitte an den Außenseiten. Front und Heck werden mit
 *    ebenen Stirnflächen geschlossen.
 *  - Glashaus („greenhouse“): von der Gürtellinie bis zum Dach, mit Einzug (Tumblehome).
 *
 * Details wie Scheinwerfer, Kühlergrill, Kennzeichen, Rückleuchten, Fensterrahmen und Säulen
 * entstehen ohne eigene Geometrie: Jedes Viereck des Lofts wird anhand von Lage und Normale einer
 * Materialgruppe zugeordnet. So folgen sie automatisch jeder Formänderung.
 */

export type BodyGroup =
  | 'paint'
  | 'hood'
  | 'lower'
  | 'roof'
  | 'glass'
  | 'dark'
  | 'gloss'
  | 'headlight'
  | 'drl'
  | 'taillight'
  | 'plate';

export const BODY_GROUPS: readonly BodyGroup[] = [
  'paint',
  'hood',
  'lower',
  'roof',
  'glass',
  'dark',
  'gloss',
  'headlight',
  'drl',
  'taillight',
  'plate',
];

export interface BodyMesh {
  /** Vertex-Positionen (x, y, z) in ISO-Koordinaten. */
  positions: Float32Array;
  /** Dreiecksindizes je Materialgruppe. */
  groups: Partial<Record<BodyGroup, Uint32Array>>;
}

/** Kühlergrill: groß beim Verbrenner, klein beim Hybrid, geschlossen beim Elektroauto. */
export type GrilleStyle = 'full' | 'small' | 'closed';

export interface BodyLayout {
  shape: BodyShape;
  xFront: number;
  xRear: number;
  width: number;
  rideHeight: number;
  noseZ: number;
  hoodZ: number;
  beltZ: number;
  roofZ: number;
  cowlX: number;
  windshieldTopX: number;
  roofEndX: number;
  rearWindowX: number;
  deckZ: number;
  open: boolean;
  /** Stützpunkte des Seitenprofils (x fallend). */
  profile: [number, number][];
  /** Verbleibende halbe Breite an Nase und Heck (Anteil), Länge der Eckrundung in m. */
  frontEnd: { k: number; length: number };
  rearEnd: { k: number; length: number };
  archFlare: number;
  grille: GrilleStyle;
  /** Durchgehendes Leuchtenband vorn und hinten (Elektro-Look). */
  lightBar: boolean;
  /** Kühlluftbedarf 0..1 (vergrößert Grill und Lufteinlass). */
  cooling: number;
  /** Säulen des Glashauses: Breite A/C in m, Lage der B-Säule und einer weiteren Säule. */
  pillars: { a: number; c: number; bX: number | null; extraX: number | null };
  /** Außenspiegel (linke Seite; die rechte ist gespiegelt). */
  mirror: { x: number; y: number; z: number } | null;
  /** Rad: Mittelpunkte (x), Radius und Spurweite je Achse. */
  wheels: { x: number; radius: number; track: number; width: number }[];
}

const deg = (d: number) => (d * Math.PI) / 180;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const smooth = (t: number) => {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
};

/** Leitet die Kennpunkte des Profils aus dem Auto ab (gemeinsam für Karosserie, Glas und Anbauteile). */
export function bodyLayout(car: Car): BodyLayout {
  const d = car.model.dimensions;
  const m = car.model.morph;
  const shape = car.model.shape;
  const L = d.length;
  const H = d.height;
  const wb = d.wheelbase;
  const xFront = d.overhangFront;
  const xRear = d.overhangFront - L;
  const rideHeight = car.suspension.rideHeight;

  const noseZ = rideHeight + H * (0.15 + 0.2 * m.noseHeight);
  const hoodZ = Math.max(noseZ + 0.06, H * (0.52 + 0.25 * m.hoodHeight));
  const beltZ = Math.max(hoodZ + 0.02, H * (0.58 + 0.14 * m.beltline));
  const roofZ = H;
  const open = shape === 'roadster';

  const placement = car.powertrain.engine?.placement ?? 'front-transverse';
  const mid = placement.startsWith('mid') || placement.startsWith('rear');
  const engineless = car.powertrain.type === 'electric';
  const cowlX = mid
    ? -wb * 0.02
    : shape === 'van'
      ? xFront - 0.35
      : -wb * ((engineless ? 0.08 : 0.12) + 0.1 * (1 - m.hoodHeight));
  const rake = shape === 'van' ? deg(58) : deg(52 - 32 * m.windshieldRake);
  const windshieldTopX = cowlX - (roofZ - hoodZ) / Math.tan(rake);

  const longRoof = shape === 'wagon' || shape === 'van' || shape === 'suv';
  const deckZ =
    shape === 'hatchback' || longRoof
      ? beltZ
      : Math.min(beltZ + 0.02, H * (0.6 + 0.15 * m.deckHeight));
  let roofEndX: number;
  let rearWindowX: number;
  if (longRoof) {
    roofEndX = xRear + (shape === 'van' ? 0.12 : 0.3);
    rearWindowX = roofEndX - (roofZ - deckZ) / Math.tan(deg(shape === 'van' ? 85 : 72));
  } else if (shape === 'pickup') {
    roofEndX = -wb * 0.5;
    rearWindowX = roofEndX - 0.08;
  } else {
    const roofLength = L * (0.08 + 0.3 * m.roofLength) * (shape === 'coupe' ? 0.8 : 1);
    roofEndX = windshieldTopX - roofLength;
    const slope =
      shape === 'hatchback' ? deg(40 + 30 * (1 - m.rearSlope)) : deg(14 + 40 * (1 - m.rearSlope));
    rearWindowX = roofEndX - (roofZ - deckZ) / Math.tan(slope);
    const minX = xRear + (shape === 'hatchback' ? 0.15 : 0.35);
    if (rearWindowX < minX) {
      rearWindowX = minX;
      roofEndX = Math.max(roofEndX, minX + 0.2);
    }
  }

  const tailZ = deckZ - 0.03;
  const profile: [number, number][] = open
    ? [
        [xFront, noseZ],
        [xFront - 0.1, noseZ + 0.06],
        [xFront - 0.4, lerp(noseZ, hoodZ, 0.8)],
        [cowlX, hoodZ],
        [cowlX - 0.15, beltZ],
        [rearWindowX, beltZ],
        [xRear + 0.15, deckZ],
        [xRear, tailZ - 0.04],
      ]
    : shape === 'pickup'
      ? [
          [xFront, noseZ],
          [xFront - 0.1, noseZ + 0.08],
          [xFront - 0.35, lerp(noseZ, hoodZ, 0.9)],
          [cowlX, hoodZ],
          [windshieldTopX, roofZ],
          [roofEndX, roofZ],
          [rearWindowX, beltZ],
          [xRear, beltZ - 0.02],
        ]
      : [
          [xFront, noseZ],
          [xFront - 0.1, noseZ + 0.07],
          [xFront - 0.4, lerp(noseZ, hoodZ, 0.82)],
          [cowlX, hoodZ],
          [windshieldTopX, roofZ],
          [roofEndX, roofZ],
          [rearWindowX, deckZ],
          [xRear + 0.12, tailZ],
          [xRear, tailZ - 0.05],
        ];

  const w = car.wheels;
  const tireRadius = (t: { width: number; aspectRatio: number }) =>
    w.rimDiameter / 2 + t.width * t.aspectRatio;

  // Säulen: Coupé und Roadster ohne sichtbare B-Säule, Kombi/SUV/Van mit zusätzlicher Säule.
  const span = cowlX - rearWindowX;
  const bAt: Partial<Record<BodyShape, number>> = {
    sedan: 0.45,
    hatchback: 0.5,
    wagon: 0.38,
    suv: 0.38,
    van: 0.28,
    pickup: 0.55,
    coupe: 0.66,
  };
  const extraAt: Partial<Record<BodyShape, number>> = { wagon: 0.7, suv: 0.7, van: 0.62 };
  const pillars = {
    a: 0.06,
    c: shape === 'hatchback' ? 0.2 : shape === 'coupe' ? 0.14 : 0.09,
    bX: bAt[shape] !== undefined ? cowlX - span * bAt[shape] : null,
    extraX: extraAt[shape] !== undefined ? cowlX - span * extraAt[shape] : null,
  };

  const layout: BodyLayout = {
    shape,
    xFront,
    xRear,
    width: d.width,
    rideHeight,
    noseZ,
    hoodZ,
    beltZ,
    roofZ,
    cowlX,
    windshieldTopX,
    roofEndX,
    rearWindowX,
    deckZ,
    open,
    profile,
    frontEnd: {
      k: 0.3 + 0.35 * m.frontTaper,
      length: clamp(d.overhangFront * 0.75, 0.25, 0.7),
    },
    rearEnd: {
      k: 0.22 + 0.35 * m.rearTaper,
      length: clamp((L - wb - d.overhangFront) * 0.75, 0.25, 0.7),
    },
    archFlare: m.archFlare,
    grille:
      car.powertrain.type === 'electric'
        ? 'closed'
        : car.powertrain.type === 'hybrid' || mid
          ? 'small'
          : 'full',
    lightBar: car.powertrain.type === 'electric',
    cooling: car.aero.cooling,
    pillars,
    mirror: null,
    wheels: [
      { x: 0, radius: tireRadius(w.front), track: d.trackFront * d.width, width: w.front.width },
      { x: -wb, radius: tireRadius(w.rear), track: d.trackRear * d.width, width: w.rear.width },
    ],
  };
  const mx = open ? cowlX - 0.12 : cowlX - 0.1;
  layout.mirror = { x: mx, y: halfWidth(layout, mx) * 0.93 + 0.08, z: beltZ + 0.07 };
  return layout;
}

function profileLinear(pts: [number, number][], x: number): number {
  if (x >= pts[0]![0]) return pts[0]![1];
  for (let i = 1; i < pts.length; i++) {
    const [x1, z1] = pts[i]!;
    const [x0, z0] = pts[i - 1]!;
    if (x >= x1) return lerp(z0, z1, (x0 - x) / Math.max(1e-6, x0 - x1));
  }
  return pts.at(-1)![1];
}

const KERNEL = [-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2].map((t) => ({
  t,
  w: Math.exp((-t * t) / 2),
}));
const KERNEL_SUM = KERNEL.reduce((a, k) => a + k.w, 0);

/** Oberkante des Profils bei x: Polygonzug, mit Gauß-Filter (σ ≈ 5 cm) geglättet. */
export function profileTop(l: BodyLayout, x: number): number {
  const sigma = 0.05;
  let z = 0;
  for (const k of KERNEL) z += k.w * profileLinear(l.profile, x + k.t * sigma);
  return z / KERNEL_SUM;
}

/** Halbe Breite in der Draufsicht bei x (ohne Spiegel). */
export function halfWidth(l: BodyLayout, x: number): number {
  const W2 = l.width / 2;
  const center = (l.xFront + l.xRear) / 2;
  const half = (l.xFront - l.xRear) / 2;
  // Leicht bauchige Flanke.
  let f = 1 - 0.03 * Math.pow((x - center) / half, 2);
  const corner = (end: { k: number; length: number }, u: number) =>
    1 - end.k * (1 - Math.sqrt(Math.max(0, 1 - u * u)));
  if (x > l.xFront - l.frontEnd.length)
    f *= corner(l.frontEnd, (x - (l.xFront - l.frontEnd.length)) / l.frontEnd.length);
  if (x < l.xRear + l.rearEnd.length)
    f *= corner(l.rearEnd, (l.xRear + l.rearEnd.length - x) / l.rearEnd.length);
  let hw = W2 * f;
  // Radhäuser: Kotflügel umschließen den Reifen, mit Ausstellung je nach Regler.
  for (const w of l.wheels) {
    const t = Math.abs(x - w.x) / (w.radius * 1.5);
    if (t >= 1) continue;
    const bell = Math.pow(1 - t * t, 2);
    const target = Math.min(W2 + 0.045, w.track / 2 + w.width / 2 + 0.01 + 0.03 * l.archFlare);
    hw += Math.max(0, target - hw) * bell;
  }
  return Math.max(0.02, hw);
}

/** Bodenhöhe mit Böschungswinkeln an Front und Heck. */
function floorZ(l: BodyLayout, x: number): number {
  return (
    l.rideHeight +
    0.06 * smooth((x - (l.xFront - 0.25)) / 0.25) +
    0.05 * smooth((l.xRear + 0.25 - x) / 0.25)
  );
}

/** Unterkante des Seitenteils: Radhausbogen um die Räder, sonst Bodenhöhe. */
function sideBottom(l: BodyLayout, x: number): number {
  let z = floorZ(l, x);
  for (const w of l.wheels) {
    const r = w.radius + 0.035 + 0.02 * l.archFlare;
    const dx = x - w.x;
    if (Math.abs(dx) < r) z = Math.max(z, w.radius + Math.sqrt(r * r - dx * dx) * 0.92);
  }
  return z;
}

export type Vec = [number, number, number];
type LowerTag = 'under' | 'sill' | 'side' | 'shoulder' | 'top';
type GlassTag = 'hidden' | 'side' | 'corner' | 'crown';

interface Half<T> {
  pts: [number, number][];
  /** Markierung je Segment (pts[i] → pts[i + 1]). */
  tags: T[];
}

function half<T>(): Half<T> & { add: (y: number, z: number, tag?: T) => void } {
  const h: Half<T> = { pts: [], tags: [] };
  return {
    ...h,
    add(y, z, tag) {
      if (h.pts.length && tag !== undefined) h.tags.push(tag);
      h.pts.push([y, z]);
    },
  };
}

/** Punkte je Hälfte eines Unterbau-Querschnitts (ab Mitte unten bis Mitte oben). */
export const LOWER_HALF_POINTS = 4 + 1 + 12 + 4 + 6;

/** Halber Querschnitt des Unterbaus bei x. */
function lowerSection(l: BodyLayout, x: number): Half<LowerTag> {
  const h = half<LowerTag>();
  const hw = halfWidth(l, x);
  const top = Math.max(l.rideHeight + 0.12, Math.min(profileTop(l, x), l.beltZ));
  // Kotflügel wölben sich über große Räder, auch wenn Haube bzw. Deckel tiefer liegen.
  let outer = top;
  for (const w of l.wheels) {
    const r = w.radius + 0.035 + 0.02 * l.archFlare;
    const t = Math.abs(x - w.x) / (r * 1.7);
    if (t < 1) outer = Math.max(outer, lerp(top, w.radius + r * 0.92 + 0.05, 1 - smooth(t)));
  }
  const floor = floorZ(l, x);
  const side = Math.max(floor, Math.min(outer - 0.07, sideBottom(l, x)));
  // Innenkante des Radhauses; an den gerundeten Enden nie breiter als die Karosserie selbst.
  const inner = Math.min(
    hw * 0.8,
    Math.max(0.05, Math.min(...l.wheels.map((w) => w.track / 2 - w.width / 2 - 0.04))),
  );
  h.add(0, floor);
  h.add(inner, floor, 'under');
  h.add(inner, side, 'under');
  h.add(Math.max(inner, hw - 0.045), side, 'under');
  // Schweller: unten eingezogen.
  const rr = Math.min(0.09, (outer - side) * 0.28);
  const zA = side + Math.min(0.03, (outer - side) * 0.1);
  h.add(hw - 0.008, zA, 'sill');
  // Flanke bis zur Schulter, nach oben leicht eingezogen.
  const NS = 12;
  let yS = hw;
  for (let i = 1; i <= NS; i++) {
    const t = i / NS;
    yS = hw * (1 - 0.035 * t * t);
    h.add(yS, lerp(zA, outer - rr, t), 'side');
  }
  // Schulter: Viertelellipse zur Haube bzw. zum Deckel.
  const NR = 4;
  const ry = rr * 0.9;
  for (let j = 1; j <= NR; j++) {
    const a = (j / NR) * (Math.PI / 2);
    h.add(yS - ry * (1 - Math.cos(a)), outer - rr + rr * Math.sin(a), 'shoulder');
  }
  // Gewölbte Oberseite.
  const y0 = yS - ry;
  const crown = 0.018;
  const NT = 6;
  for (let k = 1; k <= NT; k++) {
    const y = y0 * (1 - k / NT);
    const fender = (outer - top) * smooth((y / y0 - 0.45) / 0.55);
    h.add(y, top + crown * (1 - Math.pow(y / y0, 2)) + fender, 'top');
  }
  return h;
}

/** Maße des Glashaus-Querschnitts bei x. */
function glassFrame(l: BodyLayout, x: number, tumble: number) {
  const top = Math.max(l.beltZ, profileTop(l, x));
  const height = top - l.beltZ;
  const wBelt = halfWidth(l, x) * 0.92;
  const wTop = Math.max(0.05, wBelt - height * Math.tan(tumble));
  const r = Math.min(0.06, height * 0.3);
  return { top, height, wBelt, wTop, r };
}

/** Seitliche Lage der Glashausflanke bei (x, z) samt leichter Wölbung der Scheibe. */
function glassSideY(l: BodyLayout, x: number, z: number, tumble: number): number {
  const f = glassFrame(l, x, tumble);
  const t = clamp((z - l.beltZ) / Math.max(1e-6, f.top - f.r - l.beltZ), 0, 1);
  const bow = 0.012 * Math.sin(Math.PI * t) * Math.min(1, f.height / 0.2);
  return lerp(f.wBelt, f.wTop, t) + bow;
}

/** Halber Querschnitt des Glashauses bei x. */
function glassSection(l: BodyLayout, x: number, tumble: number): Half<GlassTag> {
  const h = half<GlassTag>();
  const { top, height, wBelt, wTop, r } = glassFrame(l, x, tumble);
  h.add(0, l.beltZ - 0.01);
  h.add(wBelt, l.beltZ - 0.01, 'hidden');
  const NS = 14;
  for (let i = 0; i <= NS; i++) {
    const t = i / NS;
    // Seitenscheibe leicht gewölbt.
    const bow = 0.012 * Math.sin(Math.PI * t) * Math.min(1, height / 0.2);
    h.add(lerp(wBelt, wTop, t) + bow, lerp(l.beltZ, top - r, t), 'side');
  }
  const NR = 3;
  for (let j = 1; j <= NR; j++) {
    const a = (j / NR) * (Math.PI / 2);
    h.add(wTop - r * (1 - Math.cos(a)), top - r + r * Math.sin(a), 'corner');
  }
  const y0 = wTop - r;
  const crown = 0.02 * Math.min(1, height / 0.25);
  const NT = 5;
  for (let k = 1; k <= NT; k++) {
    const y = y0 * (1 - k / NT);
    h.add(y, top + crown * (1 - Math.pow(y / Math.max(1e-6, y0), 2)), 'crown');
  }
  return h;
}

/** Spiegelt einen halben Querschnitt zum vollen Ring (links unten → oben → rechts unten). */
function ring<T>(x: number, h: Half<T>, yScale = 1): { ring: Vec[]; tags: T[] } {
  const pts: Vec[] = [];
  for (const [y, z] of h.pts) pts.push([x, y * yScale, z]);
  for (const [y, z] of [...h.pts].reverse().slice(1)) pts.push([x, -y * yScale, z]);
  return { ring: pts, tags: [...h.tags, ...[...h.tags].reverse()] };
}

interface Builder {
  positions: number[];
  groups: Record<BodyGroup, number[]>;
}

const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
function normalize(v: Vec): Vec {
  const n = Math.hypot(...v);
  return n < 1e-12 ? [0, 0, 0] : [v[0] / n, v[1] / n, v[2] / n];
}

/**
 * Verbindet aufeinanderfolgende Ringe gleicher Punktzahl zu Dreiecken (Wicklung nach außen,
 * wenn die Ringe von vorn nach hinten laufen). `classify` erhält Mittelpunkt und Normale je Viereck.
 */
function loft<T>(
  b: Builder,
  rings: Vec[][],
  tags: T[],
  classify: (center: Vec, normal: Vec, tag: T) => BodyGroup,
  caps: BodyGroup | null = null,
) {
  const base = b.positions.length / 3;
  const n = rings[0]!.length;
  for (const r of rings) for (const p of r) b.positions.push(...p);
  for (let r = 0; r < rings.length - 1; r++) {
    for (let s = 0; s < n - 1; s++) {
      const A = rings[r]![s]!;
      const B = rings[r]![s + 1]!;
      const C = rings[r + 1]![s]!;
      const D = rings[r + 1]![s + 1]!;
      let nrm = normalize(cross(sub(C, A), sub(B, A)));
      if (nrm[0] === 0 && nrm[1] === 0 && nrm[2] === 0)
        nrm = normalize(cross(sub(C, B), sub(D, B)));
      if (nrm[0] === 0 && nrm[1] === 0 && nrm[2] === 0) continue; // entartet
      const center: Vec = [
        (A[0] + B[0] + C[0] + D[0]) / 4,
        (A[1] + B[1] + C[1] + D[1]) / 4,
        (A[2] + B[2] + C[2] + D[2]) / 4,
      ];
      const a = base + r * n + s;
      const c = a + n;
      b.groups[classify(center, nrm, tags[s]!)].push(a, c, a + 1, a + 1, c, c + 1);
    }
  }
  if (!caps) return;
  // Stirnflächen schließen (Fächer um den Mittelpunkt des Rings).
  for (const [r, flip] of [
    [0, false],
    [rings.length - 1, true],
  ] as const) {
    const rg = rings[r]!;
    const cx = rg.reduce((a, p) => a + p[0], 0) / n;
    const cz = rg.reduce((a, p) => a + p[2], 0) / n;
    const center = b.positions.length / 3;
    b.positions.push(cx, 0, cz);
    const g = b.groups[caps];
    for (let s = 0; s < n - 1; s++) {
      const i = base + r * n + s;
      if (flip) g.push(center, i, i + 1);
      else g.push(center, i + 1, i);
    }
  }
}

/** Front: Scheinwerfer, Lichtband, Grill, Kennzeichen, Lufteinlass. */
function frontDetail(l: BodyLayout, c: Vec, n: Vec): BodyGroup | undefined {
  if (n[0] < 0.3 || c[0] < l.xFront - 0.55) return undefined;
  const ay = Math.abs(c[1]);
  const W2 = l.width / 2;
  const depth = profileTop(l, c[0]) - c[2];
  const floor = l.rideHeight + 0.06;
  const lampTop = 0.025;
  const lampH = 0.085;
  const lampIn = W2 * 0.42;
  if (n[0] > 0.4 && c[0] > l.xFront - 0.3 && ay > lampIn && ay < W2 * 0.95) {
    // Oben ein Tagfahrlicht-Streifen, darunter das Scheinwerfergehäuse.
    if (depth > lampTop && depth < lampTop + 0.018) return 'drl';
    if (depth > lampTop && depth < lampTop + lampH) return 'headlight';
  }
  const face = n[0] > 0.6;
  if (!face) return undefined;
  if (l.lightBar && ay <= lampIn && depth > lampTop && depth < lampTop + 0.018) return 'drl';
  const plateBot = floor + 0.1;
  if (ay < 0.26 && c[2] > plateBot && c[2] < plateBot + 0.11) return 'plate';
  const grilleH =
    l.grille === 'full'
      ? 0.1 + 0.12 * l.cooling
      : l.grille === 'small'
        ? 0.04 + 0.04 * l.cooling
        : 0;
  const gTop = lampTop + 0.015;
  if (grilleH > 0 && ay < W2 * 0.36 && depth > gTop && depth < gTop + grilleH) {
    const edge = Math.min(W2 * 0.36 - ay, depth - gTop, gTop + grilleH - depth);
    return edge < 0.016 ? 'gloss' : 'dark';
  }
  const intake = 0.05 + 0.06 * l.cooling + (l.grille === 'closed' ? 0.02 : 0);
  if (ay < W2 * 0.7 && c[2] < floor + intake && c[2] > floor + 0.005) return 'dark';
  return undefined;
}

/** Heck: Rückleuchten, Leuchtenband, Kennzeichen, Diffusor. */
function rearDetail(l: BodyLayout, c: Vec, n: Vec): BodyGroup | undefined {
  if (n[0] > -0.3 || c[0] > l.xRear + 0.55) return undefined;
  const ay = Math.abs(c[1]);
  const W2 = l.width / 2;
  const depth = profileTop(l, c[0]) - c[2];
  const lampTop = 0.02;
  const lampH = l.shape === 'van' || l.shape === 'suv' || l.shape === 'wagon' ? 0.12 : 0.075;
  if (c[0] < l.xRear + 0.4 && ay > W2 * 0.5 && ay < W2 * 0.97) {
    if (depth > lampTop && depth < lampTop + lampH) return 'taillight';
  }
  const face = n[0] < -0.6;
  if (!face) return undefined;
  if (l.lightBar && depth > lampTop + 0.015 && depth < lampTop + 0.032) return 'taillight';
  const plateTop = lampTop + lampH + 0.04;
  if (ay < 0.26 && depth > plateTop && depth < plateTop + 0.11) return 'plate';
  const floor = l.rideHeight + 0.05;
  if (ay < W2 * 0.8 && c[2] < floor + 0.1) return 'dark';
  return undefined;
}

/**
 * Sucht x im Bereich [lo, hi], an dem das Profil die Höhe z erreicht (Profil dort monoton).
 * `rising`: Profil steigt mit fallendem x (Windschutzscheibe), sonst fällt es (Heckscheibe).
 */
function profileCross(l: BodyLayout, z: number, lo: number, hi: number, rising: boolean): number {
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    const above = profileTop(l, mid) > z;
    if (above === rising) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

interface Opening {
  zBot: number;
  zTop: number;
  /** Hintere bzw. vordere Begrenzung der Fensterfläche in Abhängigkeit von z. */
  lo: (z: number) => number;
  hi: (z: number) => number;
}

/** Fensterfläche in der Seitenansicht: vorn entlang der Windschutzscheibe, hinten der Heckscheibe. */
function opening(l: BodyLayout, inset: number, pillarA: number, pillarC: number): Opening {
  return {
    zBot: l.beltZ + inset * 0.6,
    zTop: l.roofZ - inset,
    hi: (z) => profileCross(l, z + inset, l.windshieldTopX - 0.3, l.cowlX + 0.05, true) - pillarA,
    lo: (z) => profileCross(l, z + inset, l.rearWindowX - 0.05, l.roofEndX + 0.3, false) + pillarC,
  };
}

/** Rahmen um alle Seitenfenster (schließt B- und Zusatzsäule ein). */
const windowFrame = (l: BodyLayout) => opening(l, 0.026, l.pillars.a - 0.014, l.pillars.c - 0.014);

/** Einzelne Seitenscheiben zwischen den Säulen. */
function windowPanes(l: BodyLayout): Opening[] {
  const glass = opening(l, 0.04, l.pillars.a, l.pillars.c);
  const cuts = [l.pillars.extraX, l.pillars.bX]
    .filter((x): x is number => x !== null)
    .sort((a, c) => a - c);
  const bounds = [undefined, ...cuts, undefined];
  const panes: Opening[] = [];
  for (let k = 0; k < bounds.length - 1; k++) {
    const left = bounds[k];
    const right = bounds[k + 1];
    panes.push({
      ...glass,
      lo: (z) => (left === undefined ? glass.lo(z) : Math.max(glass.lo(z), left + 0.035)),
      hi: (z) => (right === undefined ? glass.hi(z) : Math.min(glass.hi(z), right - 0.035)),
    });
  }
  return panes;
}

/**
 * Seitenscheiben mit schwarzem Rahmen als Gitter, dessen Zeilen exakt den Konturen folgen
 * (glatte Säulen statt Treppenstufen der Loft-Vierecke).
 */
function sideWindows(b: Builder, l: BodyLayout, tumble: number) {
  const rows = 18;
  const cols = 28;
  const grid = (group: BodyGroup, o: Opening, lift: number) => {
    for (const side of [1, -1]) {
      const base = b.positions.length / 3;
      for (let i = 0; i <= rows; i++) {
        const z = lerp(o.zBot, o.zTop, i / rows);
        const x0 = o.lo(z);
        const x1 = Math.max(x0, o.hi(z));
        for (let j = 0; j <= cols; j++) {
          const x = lerp(x1, x0, j / cols);
          b.positions.push(x, side * (glassSideY(l, x, z, tumble) + lift), z);
        }
      }
      const g = b.groups[group];
      for (let i = 0; i < rows; i++)
        for (let j = 0; j < cols; j++) {
          const a = base + i * (cols + 1) + j;
          const c = a + cols + 1;
          // Wicklung nach außen auf beiden Seiten.
          if (side === 1) g.push(a, a + 1, c, a + 1, c + 1, c);
          else g.push(a, c, a + 1, a + 1, c, c + 1);
        }
    }
  };
  grid('gloss', windowFrame(l), 0.002);
  for (const pane of windowPanes(l)) grid('glass', pane, 0.004);
}

export interface SideView {
  /** Außenkontur (x, z), Front → Dach → Heck → Unterkante mit Radläufen. */
  body: [number, number][];
  /** Seitenscheiben als Polygone (x, z). */
  windows: [number, number][][];
}

/** Seitenansicht für Vorschaubilder (ohne three.js). */
export function sideView(l: BodyLayout, samples = 90): SideView {
  const body: [number, number][] = [];
  for (let i = 0; i <= samples; i++) {
    const x = lerp(l.xFront, l.xRear, warp(i / samples));
    const p = profileTop(l, x);
    const shoulder = lowerSection(l, x).pts[LOWER_HALF_POINTS - 7]![1];
    body.push([x, Math.max(l.open ? Math.min(p, l.beltZ) : p, shoulder)]);
  }
  for (let i = 0; i <= samples * 2; i++) {
    const x = lerp(l.xRear, l.xFront, i / (samples * 2));
    body.push([x, sideBottom(l, x)]);
  }
  const windows: [number, number][][] = [];
  if (!l.open) {
    for (const o of windowPanes(l)) {
      const rows = 16;
      const front: [number, number][] = [];
      const back: [number, number][] = [];
      for (let i = 0; i <= rows; i++) {
        const z = lerp(o.zBot, o.zTop, i / rows);
        const lo = o.lo(z);
        const hi = o.hi(z);
        if (hi - lo < 0.005) continue;
        front.push([hi, z]);
        back.unshift([lo, z]);
      }
      if (front.length > 1) windows.push([...front, ...back]);
    }
  }
  return { body, windows };
}

/** Verteilt die Stationen dichter an Front und Heck, wo sich die Form schnell ändert. */
const warp = (u: number) => u - (0.5 / (2 * Math.PI)) * Math.sin(2 * Math.PI * u);

/**
 * Erzeugt die Karosseriegeometrie. `stations` steuert die Auflösung entlang der Länge.
 */
export function buildBody(car: Car, stations = 180): BodyMesh {
  const l = bodyLayout(car);
  const m = car.model.morph;
  const b: Builder = {
    positions: [],
    groups: Object.fromEntries(BODY_GROUPS.map((g) => [g, []])) as unknown as Record<
      BodyGroup,
      number[]
    >,
  };
  const lowerZone = l.rideHeight + 0.1;

  // ---------- Unterbau ----------
  const sections: Half<LowerTag>[] = [];
  const rings: Vec[][] = [];
  let tags: LowerTag[] = [];
  for (let i = 0; i <= stations; i++) {
    const x = lerp(l.xFront, l.xRear, warp(i / stations));
    const h = lowerSection(l, x);
    sections.push(h);
    const r = ring(x, h);
    rings.push(r.ring);
    tags = r.tags;
  }
  loft(b, rings, tags, (c, n, tag) => {
    if (tag === 'under' || n[2] < -0.5) return 'dark';
    const detail = frontDetail(l, c, n) ?? rearDetail(l, c, n);
    if (detail) return detail;
    const upper = tag === 'top' || (tag === 'shoulder' && n[2] > 0.75);
    if (upper && l.shape === 'pickup' && c[0] < l.rearWindowX - 0.04) return 'gloss';
    if (upper && c[0] > l.cowlX + 0.02) return 'hood';
    if (c[2] < lowerZone) return 'lower';
    return 'paint';
  });

  // Stirnflächen: der erste/letzte Ring wird zur Mitte hin zusammengezogen.
  const scales = Array.from({ length: 25 }, (_, i) => i / 24);
  const face = (h: Half<LowerTag>, x: number, s: number[]) => s.map((k) => ring(x, h, k).ring);
  const frontRings = face(sections[0]!, l.xFront, scales);
  loft(b, frontRings, tags, (c, n, tag) =>
    tag === 'under' ? 'dark' : (frontDetail(l, c, n) ?? (c[2] < lowerZone ? 'lower' : 'paint')),
  );
  const rearRings = face(sections.at(-1)!, l.xRear, [...scales].reverse());
  loft(b, rearRings, tags, (c, n, tag) =>
    tag === 'under' ? 'dark' : (rearDetail(l, c, n) ?? (c[2] < lowerZone ? 'lower' : 'paint')),
  );

  // ---------- Glashaus ----------
  if (!l.open) {
    const start = l.cowlX;
    const end = l.rearWindowX;
    const n = Math.max(12, Math.round((start - end) / 0.022));
    const tumble = deg(4 + 18 * m.tumblehome);
    const gh: Vec[][] = [];
    let gTags: GlassTag[] = [];
    for (let i = 0; i <= n; i++) {
      const r = ring(lerp(start, end, i / n), glassSection(l, lerp(start, end, i / n), tumble));
      gh.push(r.ring);
      gTags = r.tags;
    }
    loft(
      b,
      gh,
      gTags,
      (c, _n, tag) => {
        const [x, , z] = c;
        if (tag === 'hidden') return 'dark';
        if (tag === 'corner') return 'roof';
        if (tag === 'crown') {
          if (x > l.windshieldTopX - 0.01) return z < l.hoodZ + 0.03 ? 'gloss' : 'glass';
          if (x < l.roofEndX + 0.01) return z < l.deckZ + 0.03 ? 'gloss' : 'glass';
          return 'roof';
        }
        // Flanke des Glashauses in Dachfarbe, unten die Fensterdichtung; die Scheiben liegen als
        // eigene Flächen darüber (glatte Konturen statt Treppenstufen).
        return z < l.beltZ + 0.022 ? 'gloss' : 'roof';
      },
      'gloss',
    );
    sideWindows(b, l, tumble);
  } else {
    // Roadster: Windschutzscheibe mit Rahmen und dunkler Innenraum.
    const ws: Vec[][] = [];
    const top = l.beltZ + (car.model.dimensions.height - l.beltZ) * 0.75;
    const steps = 6;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const rake = deg(62 - 22 * m.windshieldRake);
      const x = lerp(l.cowlX, l.cowlX - (top - l.hoodZ) / Math.tan(rake), t);
      const z = lerp(l.hoodZ, top, t);
      const hw = halfWidth(l, x) * (0.9 - 0.1 * t);
      ws.push(
        [hw, hw * 0.94, hw * 0.5, 0, -hw * 0.5, -hw * 0.94, -hw].map((y): Vec => [
          x,
          y,
          z + 0.012 * (1 - Math.pow(y / hw, 2)),
        ]),
      );
    }
    loft(b, ws, [0, 1, 2, 3, 4, 5], (c, _n, s) =>
      s === 0 || s === 5 || c[2] > top - 0.03 ? 'gloss' : 'glass',
    );
    const cockpit: Vec[][] = [l.cowlX - 0.2, l.rearWindowX + 0.1].map((x) => {
      const hw = halfWidth(l, x) * 0.8;
      return [
        [x, hw, l.beltZ + 0.004],
        [x, 0, l.beltZ + 0.004],
        [x, -hw, l.beltZ + 0.004],
      ];
    });
    loft(b, cockpit, [0, 1], () => 'dark');
  }

  const groups: Partial<Record<BodyGroup, Uint32Array>> = {};
  for (const [k, v] of Object.entries(b.groups) as [BodyGroup, number[]][])
    if (v.length) groups[k] = new Uint32Array(v);
  return { positions: new Float32Array(b.positions), groups };
}

/**
 * Fugen auf der linken Flanke und der Haube als Polylinien (ISO-Koordinaten, knapp über der
 * Oberfläche). Die rechte Seite ergibt sich durch Spiegeln von y.
 */
export function panelSeams(l: BodyLayout): Vec[][] {
  const [front, rear] = l.wheels as [BodyLayout['wheels'][0], BodyLayout['wheels'][0]];
  const start = Math.min(l.cowlX - 0.03, front.x - front.radius - 0.12);
  const rearArch = rear.x + rear.radius + 0.1;
  const fourDoor = ['sedan', 'wagon', 'suv', 'van'].includes(l.shape) && l.pillars.bX !== null;
  const cuts = [start];
  if (fourDoor && l.pillars.bX! - 0.4 > rearArch) cuts.push(l.pillars.bX!, l.pillars.bX! - 0.9);
  else cuts.push(l.pillars.bX ?? start - 1.1);
  const seams: Vec[][] = [];
  for (const raw of cuts) {
    const x = Math.max(rearArch, Math.min(start, raw));
    const h = lowerSection(l, x);
    // Schweller- und Flankenpunkte (Index 4 … 16) bis knapp unter die Gürtellinie.
    seams.push(
      h.pts
        .slice(4, 17)
        .filter(([, z]) => z < l.beltZ - 0.01)
        .map(([y, z]): Vec => [x, y + 0.003, z]),
    );
  }
  // Haubenfuge entlang der Schulter.
  const hood: Vec[] = [];
  const x0 = l.cowlX - 0.01;
  const x1 = l.xFront - 0.3;
  if (x1 > x0 + 0.2) {
    for (let i = 0; i <= 16; i++) {
      const x = lerp(x0, x1, i / 16);
      const [y, z] = lowerSection(l, x).pts[LOWER_HALF_POINTS - 7]!;
      hood.push([x, y * 0.96, z + 0.004]);
    }
    seams.push(hood);
  }
  return seams.filter((s) => s.length > 1);
}
