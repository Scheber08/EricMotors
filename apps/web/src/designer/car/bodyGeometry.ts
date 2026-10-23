import type { Car } from '@ericmotors/schema';

/**
 * Parametrische Karosserie als Loft aus Querschnitten (reine Funktion, ohne three.js).
 *
 * Koordinaten nach ISO 8855 in m: x nach vorn (Vorderachse bei x = 0), y nach links, z nach oben.
 * Der Viewer rechnet in three.js-Koordinaten um (x → x, z → y, y → −z).
 *
 * Aufbau:
 *  - Seitenprofil (Oberkante) aus Grundform und Form-Reglern: Nase → Haube → Windschutzscheibe →
 *    Dach → Heckscheibe → Heckdeckel → Heck.
 *  - Unterbau („lower“): vom Boden bis min(Profil, Gürtellinie), mit Radhausausschnitten an den
 *    Außenseiten; der Unterboden in der Mitte bleibt durchgehend.
 *  - Glashaus („greenhouse“): von der Gürtellinie bis zum Dach, mit Einzug (Tumblehome).
 */

export type BodyGroup = 'paint' | 'hood' | 'lower' | 'roof' | 'glass' | 'dark';

export interface BodyMesh {
  /** Vertex-Positionen (x, y, z) in ISO-Koordinaten. */
  positions: Float32Array;
  /** Dreiecksindizes je Materialgruppe. */
  groups: Partial<Record<BodyGroup, Uint32Array>>;
}

export interface BodyLayout {
  xFront: number;
  xRear: number;
  rideHeight: number;
  hoodZ: number;
  beltZ: number;
  roofZ: number;
  cowlX: number;
  windshieldTopX: number;
  roofEndX: number;
  rearWindowX: number;
  deckZ: number;
  open: boolean;
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

  const hoodZ = H * (0.52 + 0.25 * m.hoodHeight);
  const beltZ = Math.max(hoodZ + 0.02, H * (0.58 + 0.14 * m.beltline));
  const roofZ = H;
  const open = shape === 'roadster';

  const mid = car.engine.placement.startsWith('mid') || car.engine.placement.startsWith('rear');
  const cowlX = mid
    ? -wb * 0.02
    : shape === 'van'
      ? xFront - 0.35
      : -wb * (0.12 + 0.1 * (1 - m.hoodHeight));
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

  const w = car.wheels;
  const tireRadius = (t: { width: number; aspectRatio: number }) =>
    w.rimDiameter / 2 + t.width * t.aspectRatio;
  return {
    xFront,
    xRear,
    rideHeight,
    hoodZ,
    beltZ,
    roofZ,
    cowlX,
    windshieldTopX,
    roofEndX,
    rearWindowX,
    deckZ,
    open,
    wheels: [
      { x: 0, radius: tireRadius(w.front), track: d.trackFront * d.width, width: w.front.width },
      { x: -wb, radius: tireRadius(w.rear), track: d.trackRear * d.width, width: w.rear.width },
    ],
  };
}

/** Oberkante des Profils bei x (stückweise linear mit geglätteten Übergängen). */
export function profileTop(car: Car, l: BodyLayout, x: number): number {
  const H = car.model.dimensions.height;
  const m = car.model.morph;
  const noseZ = l.rideHeight + H * (0.1 + 0.2 * m.noseHeight);
  const tailZ = Math.min(l.deckZ, l.deckZ - 0.03);
  const pts: [number, number][] = l.open
    ? [
        [l.xFront, noseZ],
        [l.xFront - 0.07, noseZ + 0.05],
        [l.xFront - 0.35, lerp(noseZ, l.hoodZ, 0.8)],
        [l.cowlX, l.hoodZ],
        [l.cowlX - 0.15, l.beltZ],
        [l.rearWindowX, l.beltZ],
        [l.xRear + 0.12, l.deckZ],
        [l.xRear, tailZ - 0.05],
      ]
    : car.model.shape === 'pickup'
      ? [
          [l.xFront, noseZ],
          [l.xFront - 0.07, noseZ + 0.07],
          [l.xFront - 0.3, lerp(noseZ, l.hoodZ, 0.9)],
          [l.cowlX, l.hoodZ],
          [l.windshieldTopX, l.roofZ],
          [l.roofEndX, l.roofZ],
          [l.rearWindowX, l.beltZ],
          [l.xRear, l.beltZ - 0.02],
        ]
      : [
          [l.xFront, noseZ],
          [l.xFront - 0.07, noseZ + 0.06],
          [l.xFront - 0.35, lerp(noseZ, l.hoodZ, 0.82)],
          [l.cowlX, l.hoodZ],
          [l.windshieldTopX, l.roofZ],
          [l.roofEndX, l.roofZ],
          [l.rearWindowX, l.deckZ],
          [l.xRear + 0.08, tailZ],
          [l.xRear, tailZ - 0.06],
        ];
  // x fällt entlang der Punkte (Front → Heck).
  if (x >= pts[0]![0]) return pts[0]![1];
  for (let i = 1; i < pts.length; i++) {
    const [x1, z1] = pts[i]!;
    const [x0, z0] = pts[i - 1]!;
    if (x >= x1) {
      const t = (x0 - x) / Math.max(1e-6, x0 - x1);
      // Kanten zwischen Flächen leicht verrunden.
      return lerp(z0, z1, t < 0.5 ? 0.5 * smooth(2 * t) : 0.5 + 0.5 * (2 * t - 1));
    }
  }
  return pts.at(-1)![1];
}

/** Halbe Breite in der Draufsicht bei x: Superellipse mit Verjüngung an Front und Heck. */
export function halfWidth(car: Car, l: BodyLayout, x: number): number {
  const W = car.model.dimensions.width;
  const m = car.model.morph;
  const center = (l.xFront + l.xRear) / 2;
  const half = (l.xFront - l.xRear) / 2;
  const t = clamp(Math.abs(x - center) / half, 0, 1);
  const rounded = Math.pow(1 - Math.pow(t, 4.5), 1 / 4.5);
  const front = x > center ? 1 - 0.18 * m.frontTaper * smooth((x - center) / half) : 1;
  const rear = x < center ? 1 - 0.14 * m.rearTaper * smooth((center - x) / half) : 1;
  return Math.max(0.02, (W / 2) * rounded * front * rear);
}

/** Unterkante des Seitenteils: Radhausbogen um die Räder, sonst Bodenhöhe. */
function sideBottom(l: BodyLayout, x: number, flare: number): number {
  let z = l.rideHeight + (x > l.xFront - 0.25 ? 0.06 * smooth((x - (l.xFront - 0.25)) / 0.25) : 0);
  for (const w of l.wheels) {
    const r = w.radius + 0.035 + 0.02 * flare;
    const dx = x - w.x;
    if (Math.abs(dx) < r) z = Math.max(z, w.radius + Math.sqrt(r * r - dx * dx) * 0.92);
  }
  return z;
}

interface Builder {
  positions: number[];
  groups: Record<BodyGroup, number[]>;
}

/** Verbindet aufeinanderfolgende Ringe gleicher Punktzahl zu Dreiecken. */
function loft(
  b: Builder,
  rings: [number, number, number][][],
  groupOf: (ring: number, seg: number, zMid: number) => BodyGroup,
) {
  const base = b.positions.length / 3;
  const n = rings[0]!.length;
  for (const ring of rings) for (const p of ring) b.positions.push(...p);
  for (let r = 0; r < rings.length - 1; r++) {
    for (let s = 0; s < n - 1; s++) {
      const a = base + r * n + s;
      const c = a + n;
      const zMid = (rings[r]![s]![2] + rings[r + 1]![s + 1]![2]) / 2;
      const g = b.groups[groupOf(r, s, zMid)];
      g.push(a, c, a + 1, a + 1, c, c + 1);
    }
  }
  // Stirnflächen schließen (Fächer um den Mittelpunkt des Rings).
  for (const [r, flip] of [
    [0, false],
    [rings.length - 1, true],
  ] as const) {
    const ring = rings[r]!;
    const cx = ring.reduce((a, p) => a + p[0], 0) / n;
    const cz = ring.reduce((a, p) => a + p[2], 0) / n;
    const center = b.positions.length / 3;
    b.positions.push(cx, 0, cz);
    const g = b.groups[groupOf(r, 0, cz)];
    for (let s = 0; s < n - 1; s++) {
      const i = base + r * n + s;
      if (flip) g.push(center, i, i + 1);
      else g.push(center, i + 1, i);
    }
  }
}

/**
 * Erzeugt die Karosseriegeometrie. `stations` steuert die Auflösung entlang der Länge.
 */
export function buildBody(car: Car, stations = 72): BodyMesh {
  const l = bodyLayout(car);
  const m = car.model.morph;
  const b: Builder = {
    positions: [],
    groups: { paint: [], hood: [], lower: [], roof: [], glass: [], dark: [] },
  };
  const lowerZone = l.rideHeight + 0.11;

  // ---------- Unterbau ----------
  const rings: [number, number, number][][] = [];
  for (let i = 0; i <= stations; i++) {
    const x = lerp(l.xFront, l.xRear, i / stations);
    const hw = halfWidth(car, l, x);
    const top = Math.max(l.rideHeight + 0.08, Math.min(profileTop(car, l, x), l.beltZ));
    const floor =
      l.rideHeight + (x > l.xFront - 0.25 ? 0.06 * smooth((x - (l.xFront - 0.25)) / 0.25) : 0);
    const side = Math.min(top - 0.03, sideBottom(l, x, m.archFlare));
    // Innenkante des Radhauses; an den gerundeten Enden nie breiter als die Karosserie selbst.
    const inner = Math.min(
      hw * 0.8,
      Math.max(0.05, Math.min(...l.wheels.map((w) => w.track / 2 - w.width / 2 - 0.04))),
    );
    const flare = 0.02 * m.archFlare;
    const shoulder = hw * 0.97;
    // Halber Querschnitt (links, y > 0) von unten Mitte bis oben Mitte.
    const half: [number, number][] = [
      [0, floor],
      [inner, floor],
      [inner, side],
      [Math.max(inner, hw - 0.01), side],
      [hw + flare, lerp(side, top, 0.25)],
      [hw + flare * 0.5, lerp(side, top, 0.55)],
      [shoulder, lerp(side, top, 0.85)],
      [hw * 0.85, top - 0.005],
      [hw * 0.45, top + 0.012],
      [0, top + 0.015],
    ];
    const ring: [number, number, number][] = [];
    for (const [y, z] of half) ring.push([x, y, z]);
    for (const [y, z] of [...half].reverse().slice(1)) ring.push([x, -y, z]);
    rings.push(ring);
  }
  const halfCount = 10;
  loft(b, rings, (_r, s, z) => {
    const topSeg = s >= halfCount - 3 && s < halfCount + 2;
    if (topSeg && rings[_r]![0]![0] > l.cowlX) return 'hood';
    if (s <= 1 || s >= 2 * halfCount - 4) return 'dark'; // Unterboden
    if (z < lowerZone) return 'lower';
    return 'paint';
  });

  // ---------- Glashaus ----------
  if (!l.open) {
    const start = l.cowlX;
    const end = l.rearWindowX;
    const n = Math.max(8, Math.round(stations * ((start - end) / (l.xFront - l.xRear))));
    const tumble = deg(4 + 18 * m.tumblehome);
    const gh: [number, number, number][][] = [];
    for (let i = 0; i <= n; i++) {
      const x = lerp(start, end, i / n);
      const top = Math.max(l.beltZ, profileTop(car, l, x));
      const h = top - l.beltZ;
      const wBelt = halfWidth(car, l, x) * 0.95;
      const wTop = Math.max(0.05, wBelt - h * Math.tan(tumble));
      const r = Math.min(0.05, h * 0.3);
      const half: [number, number][] = [
        [0, l.beltZ - 0.01],
        [wBelt, l.beltZ - 0.01],
        [lerp(wBelt, wTop, 0.5), l.beltZ + h * 0.5],
        [wTop, top - r],
        [wTop - r, top],
        [0, top + 0.01],
      ];
      const ring: [number, number, number][] = [];
      for (const [y, z] of half) ring.push([x, y, z]);
      for (const [y, z] of [...half].reverse().slice(1)) ring.push([x, -y, z]);
      gh.push(ring);
    }
    const ghHalf = 6;
    loft(b, gh, (r, s) => {
      const x = gh[r]![0]![0];
      const onRoof =
        s >= ghHalf - 3 && s <= ghHalf && x < l.windshieldTopX - 0.05 && x > l.roofEndX + 0.05;
      if (onRoof) return 'roof';
      return s === 0 || s === 2 * ghHalf - 3 ? 'dark' : 'glass';
    });
  } else {
    // Roadster: Windschutzscheibe als schmales Glashaus und dunkler Innenraum.
    const ws: [number, number, number][][] = [];
    const top = l.beltZ + (car.model.dimensions.height - l.beltZ) * 0.9;
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      const x = lerp(l.cowlX, l.cowlX - (top - l.hoodZ) / Math.tan(deg(32)), t);
      const z = lerp(l.hoodZ, top, t);
      const hw = halfWidth(car, l, x) * (0.92 - 0.1 * t);
      ws.push([
        [x, hw, z - 0.004],
        [x, 0, z + 0.004],
        [x, -hw, z - 0.004],
      ]);
    }
    loft(b, ws, () => 'glass');
    const cockpit: [number, number, number][][] = [l.cowlX - 0.2, l.rearWindowX + 0.1].map((x) => {
      const hw = halfWidth(car, l, x) * 0.8;
      return [
        [x, hw, l.beltZ + 0.004],
        [x, 0, l.beltZ + 0.004],
        [x, -hw, l.beltZ + 0.004],
      ];
    });
    loft(b, cockpit, () => 'dark');
  }

  const groups: Partial<Record<BodyGroup, Uint32Array>> = {};
  for (const [k, v] of Object.entries(b.groups) as [BodyGroup, number[]][])
    if (v.length) groups[k] = new Uint32Array(v);
  return { positions: new Float32Array(b.positions), groups };
}
