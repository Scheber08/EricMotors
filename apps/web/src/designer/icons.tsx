import type { ReactNode } from 'react';

/**
 * Kleine SVG-Piktogramme für Auswahlkarten (48 × 32, Strichstärke 2, currentColor).
 * Schlüssel: Optionsgruppe → Wert. Fehlt ein Piktogramm, zeigt die Karte nur Text.
 */
const Svg = ({ children }: { children: ReactNode }) => (
  <svg
    viewBox="0 0 48 32"
    width="48"
    height="32"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

/** Seitenansicht: Karosserielinie + zwei Räder. */
const side = (body: string, wheels: [number, number] = [13, 36], r = 4) => (
  <Svg>
    <path d={body} />
    <circle cx={wheels[0]} cy={25} r={r} />
    <circle cx={wheels[1]} cy={25} r={r} />
  </Svg>
);

/** Draufsicht Fahrgestell: vier Räder, angetriebene gefüllt, optional ein Block. */
const chassis = (driven: { front: boolean; rear: boolean }, extra?: ReactNode) => (
  <Svg>
    <rect x="8" y="9" width="32" height="14" rx="5" />
    {[
      [11, 5, driven.front],
      [11, 23, driven.front],
      [33, 5, driven.rear],
      [33, 23, driven.rear],
    ].map(([x, y, on], i) => (
      <rect
        key={i}
        x={x as number}
        y={y as number}
        width="6"
        height="4"
        rx="1"
        fill={on ? 'currentColor' : 'none'}
      />
    ))}
    {extra}
  </Svg>
);

/** Draufsicht Auto (Front links) mit Motorblock an Position x und Ausrichtung. */
const placement = (x: number, transverse: boolean) => (
  <Svg>
    <rect x="4" y="6" width="40" height="20" rx="7" />
    <path d="M16 8v16M30 8v16" strokeOpacity="0.35" />
    {transverse ? (
      <rect x={x - 3} y="10" width="6" height="12" rx="1" fill="currentColor" />
    ) : (
      <rect x={x - 6} y="12.5" width="12" height="7" rx="1" fill="currentColor" />
    )}
  </Svg>
);

const wheel = (spokes: ReactNode) => (
  <Svg>
    <circle cx="24" cy="16" r="13" />
    <circle cx="24" cy="16" r="9" strokeOpacity="0.5" />
    {spokes}
    <circle cx="24" cy="16" r="2" fill="currentColor" />
  </Svg>
);

const radial = (n: number, r1: number, r2: number, width = 2) => (
  <g strokeWidth={width}>
    {Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      return (
        <line
          key={i}
          x1={24 + Math.cos(a) * r1}
          y1={16 + Math.sin(a) * r1}
          x2={24 + Math.cos(a) * r2}
          y2={16 + Math.sin(a) * r2}
        />
      );
    })}
  </g>
);

const tread = (d: string) => (
  <Svg>
    <rect x="12" y="3" width="24" height="26" rx="4" />
    <path d={d} />
  </Svg>
);

/** Batterie mit Füllstand/Blitz. */
const battery = (inner: ReactNode) => (
  <Svg>
    <rect x="8" y="8" width="30" height="16" rx="2" />
    <rect x="38" y="12" width="3" height="8" rx="1" fill="currentColor" />
    {inner}
  </Svg>
);

const bolt = 'M25 10l-5 7h5l-2 6 6-8h-5z';

const cylinders = (pts: [number, number][], extra?: ReactNode) => (
  <Svg>
    <path d="M6 28h36" strokeOpacity="0.4" />
    {pts.map(([x, y], i) => (
      <circle key={i} cx={x} cy={y} r="4" />
    ))}
    {extra}
  </Svg>
);

export const OPTION_ICONS: Record<string, Record<string, ReactNode>> = {
  engineLayout: {
    inline: cylinders([
      [12, 16],
      [20, 16],
      [28, 16],
      [36, 16],
    ]),
    v: cylinders(
      [
        [15, 10],
        [19, 18],
        [33, 10],
        [29, 18],
      ],
      <path d="M24 26l-11-20M24 26l11-20" strokeOpacity="0.4" />,
    ),
    boxer: cylinders(
      [
        [8, 16],
        [16, 16],
        [32, 16],
        [40, 16],
      ],
      <path d="M20 16h8" />,
    ),
  },
  shape: {
    coupe: side('M4 23v-5l8-2 7-6h10l9 6 6 2v5'),
    sedan: side('M4 23v-6l8-1 6-6h12l6 6 8 1v6'),
    wagon: side('M4 23v-6l8-1 6-7h22l4 7v7'),
    hatchback: side('M5 23v-6l8-1 6-7h13l8 8v6'),
    suv: side('M4 24v-9l7-1 5-7h22l4 7v10', [13, 36], 4.5),
    roadster: side('M4 23v-5l11-2 4-4M21 16h10l6 1 7 1v5'),
    pickup: side('M4 24v-8l7-1 4-7h10v8h19v8', [12, 37], 4.5),
    van: side('M5 24V9l5-4h30v19', [13, 36], 4),
  },
  layout: {
    fwd: chassis({ front: true, rear: false }),
    rwd: chassis({ front: false, rear: true }),
    awd: chassis({ front: true, rear: true }),
  },
  placement: {
    'front-longitudinal': placement(12, false),
    'front-transverse': placement(11, true),
    'mid-longitudinal': placement(31, false),
    'mid-transverse': placement(31, true),
    'rear-longitudinal': placement(37, false),
  },
  chassis: {
    monocoque: (
      <Svg>
        <path d="M5 22c4-10 12-14 19-14s15 4 19 14z" />
        <path d="M10 22h28" />
      </Svg>
    ),
    ladder: (
      <Svg>
        <path d="M4 10h40M4 22h40M10 10v12M20 10v12M30 10v12M40 10v12" />
      </Svg>
    ),
    spaceframe: (
      <Svg>
        <path d="M4 24h40M8 10h32M4 24l4-14 8 14 8-14 8 14 8-14 4 14" />
      </Svg>
    ),
  },
  gearbox: {
    manual: (
      <Svg>
        <path d="M12 6v20M24 6v20M36 6v20M12 16h24" />
        <circle cx="12" cy="6" r="1.5" fill="currentColor" />
        <circle cx="36" cy="26" r="1.5" fill="currentColor" />
      </Svg>
    ),
    automatic: (
      <Svg>
        <rect x="17" y="3" width="14" height="26" rx="3" />
        <path d="M24 7v18" strokeOpacity="0.35" />
        <rect x="20" y="17" width="8" height="5" rx="1" fill="currentColor" />
      </Svg>
    ),
    dct: (
      <Svg>
        <circle cx="18" cy="16" r="10" />
        <circle cx="30" cy="16" r="10" />
      </Svg>
    ),
    sequential: (
      <Svg>
        <path d="M24 4v24M18 10l6-6 6 6M18 22l6 6 6-6" />
      </Svg>
    ),
    cvt: (
      <Svg>
        <path d="M6 8l8 8-8 8zM42 12l-4 4 4 4z" />
        <path d="M10 9l30 4M10 23l30-4" />
      </Svg>
    ),
  },
  differential: {
    open: (
      <Svg>
        <circle cx="24" cy="16" r="7" />
        <path d="M4 16h13M31 16h13" />
      </Svg>
    ),
    viscous: (
      <Svg>
        <circle cx="24" cy="16" r="7" />
        <path d="M4 16h13M31 16h13M20 13q4 3 8 0M20 19q4 -3 8 0" />
      </Svg>
    ),
    'plate-lsd': (
      <Svg>
        <circle cx="24" cy="16" r="9" />
        <path d="M4 16h11M33 16h11M20 9v14M24 7v18M28 9v14" />
      </Svg>
    ),
    torsen: (
      <Svg>
        <circle cx="24" cy="16" r="8" />
        <path d="M4 16h12M32 16h12M19 11l10 10M29 11l-10 10" />
      </Svg>
    ),
    active: (
      <Svg>
        <circle cx="24" cy="16" r="8" />
        <path d="M4 16h12M32 16h12" />
        <path d={bolt} fill="currentColor" stroke="none" transform="translate(0 0)" />
      </Svg>
    ),
  },
  tireType: {
    eco: tread('M18 3v26M30 3v26'),
    touring: tread('M18 3v26M30 3v26M12 10l6 3M36 10l-6 3M12 22l6 3M36 22l-6 3'),
    sport: tread('M20 3v26M12 8l8 4M36 8l-8 4M12 18l8 4M36 18l-8 4'),
    'semi-slick': tread('M24 3v26'),
    slick: tread(''),
    'all-terrain': tread('M16 7h6v5h-6zM26 7h6v5h-6zM16 19h6v5h-6zM26 19h6v5h-6z'),
    offroad: tread('M12 6h9v7h-9zM27 6h9v7h-9zM18 18h12v8H18z'),
  },
  rimDesign: {
    steel: wheel(
      <g>
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const a = (i / 6) * Math.PI * 2;
          return <circle key={i} cx={24 + Math.cos(a) * 5.5} cy={16 + Math.sin(a) * 5.5} r="1" />;
        })}
      </g>,
    ),
    'five-spoke': wheel(radial(5, 2, 9, 3)),
    'multi-spoke': wheel(radial(10, 2, 9, 1.5)),
    mesh: wheel(
      <g strokeWidth="1">
        {radial(8, 2, 9, 1)}
        <circle cx="24" cy="16" r="5" />
      </g>,
    ),
    aero: wheel(<circle cx="24" cy="16" r="8" fill="currentColor" fillOpacity="0.35" />),
  },
  brakeType: {
    drum: (
      <Svg>
        <circle cx="24" cy="16" r="12" />
        <path d="M16 12a9 9 0 0 1 16 0M16 20a9 9 0 0 0 16 0" strokeWidth="3" />
      </Svg>
    ),
    'solid-disc': (
      <Svg>
        <circle cx="24" cy="16" r="12" />
        <circle cx="24" cy="16" r="4" />
        <path d="M33 6l5 3v14l-5 3" strokeWidth="3" />
      </Svg>
    ),
    'vented-disc': (
      <Svg>
        <circle cx="24" cy="16" r="12" />
        <circle cx="24" cy="16" r="4" />
        {radial(8, 6, 10, 1.5)}
        <path d="M33 6l5 3v14l-5 3" strokeWidth="3" />
      </Svg>
    ),
    'carbon-ceramic': (
      <Svg>
        <circle cx="24" cy="16" r="12" fill="currentColor" fillOpacity="0.25" />
        <circle cx="24" cy="16" r="4" />
        {radial(12, 6, 10, 1)}
        <path d="M33 6l5 3v14l-5 3" strokeWidth="3" />
      </Svg>
    ),
  },
  undertray: {
    none: (
      <Svg>
        <path d="M4 12h40M8 18l4 6M18 18l3 6M28 18l3 6M38 18l3 6" />
      </Svg>
    ),
    partial: (
      <Svg>
        <path d="M4 12h40M4 20h20M30 18l3 6M38 18l3 6" />
      </Svg>
    ),
    full: (
      <Svg>
        <path d="M4 12h40M4 20h40" />
      </Svg>
    ),
  },
  powertrainType: {
    ice: (
      <Svg>
        <rect x="10" y="6" width="18" height="22" rx="2" />
        <path d="M14 12h10M28 12l6 3v10a2 2 0 0 0 4 0V11l-4-4" />
      </Svg>
    ),
    electric: (
      <Svg>
        <path d="M18 4v7M30 4v7M14 11h20v6a10 10 0 0 1-20 0zM24 27v3" />
        <path d="M25 13l-3 5h4l-2 4" />
      </Svg>
    ),
    hybrid: (
      <Svg>
        <rect x="4" y="8" width="15" height="18" rx="2" />
        <path d="M7 13h9" />
        <path d="M30 6v6M38 6v6M27 12h14v4a7 7 0 0 1-14 0zM34 23v4" />
        <path d="M21 17h4" />
      </Svg>
    ),
  },
  motorPosition: {
    front: chassis(
      { front: true, rear: false },
      <circle cx="14" cy="16" r="3.5" fill="currentColor" />,
    ),
    rear: chassis(
      { front: false, rear: true },
      <circle cx="36" cy="16" r="3.5" fill="currentColor" />,
    ),
    gearbox: chassis(
      { front: true, rear: false },
      <>
        <rect x="11" y="12" width="7" height="8" rx="1" />
        <circle cx="22" cy="16" r="3" fill="currentColor" />
      </>,
    ),
  },
  motorType: {
    pmsm: (
      <Svg>
        <circle cx="24" cy="16" r="12" />
        <circle cx="24" cy="16" r="6" />
        <path d="M24 10v12" strokeWidth="3" />
      </Svg>
    ),
    induction: (
      <Svg>
        <circle cx="24" cy="16" r="12" />
        <circle cx="24" cy="16" r="6" />
        {radial(8, 2, 6, 1.2)}
      </Svg>
    ),
    'axial-flux': (
      <Svg>
        <ellipse cx="24" cy="16" rx="5" ry="13" />
        <ellipse cx="17" cy="16" rx="3" ry="11" />
        <ellipse cx="31" cy="16" rx="3" ry="11" />
      </Svg>
    ),
  },
  motorCount: {
    1: chassis({ front: false, rear: true }, <circle cx="36" cy="16" r="3" fill="currentColor" />),
    2: chassis(
      { front: false, rear: true },
      <>
        <circle cx="36" cy="12" r="2.5" fill="currentColor" />
        <circle cx="36" cy="20" r="2.5" fill="currentColor" />
      </>,
    ),
  },
  cooling: {
    passive: (
      <Svg>
        <path d="M10 8h28M10 16h28M10 24h28" strokeOpacity="0.5" />
      </Svg>
    ),
    air: (
      <Svg>
        <circle cx="24" cy="16" r="12" />
        <path d="M24 16c0-6 6-8 6-4s-6 4-6 4 -6 2-4 6 4-6 4-6 2 6 6 4-6-4-6-4" />
      </Svg>
    ),
    liquid: (
      <Svg>
        <path d="M24 4c-6 9-9 13-9 17a9 9 0 0 0 18 0c0-4-3-8-9-17z" />
      </Svg>
    ),
    'oil-spray': (
      <Svg>
        <path d="M14 6c-4 6-6 9-6 12a6 6 0 0 0 12 0c0-3-2-6-6-12z" />
        <path d="M28 10l12-4M28 16h14M28 22l12 4" strokeDasharray="2 3" />
      </Svg>
    ),
  },
  cells: {
    energy: battery(<rect x="11" y="11" width="24" height="10" fill="currentColor" />),
    balanced: battery(
      <>
        <rect x="11" y="11" width="13" height="10" fill="currentColor" />
        <path d="M31 11l-3 5h4l-3 5" />
      </>,
    ),
    power: battery(<path d={bolt} fill="currentColor" stroke="none" />),
  },
};
