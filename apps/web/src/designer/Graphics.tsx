import { useT } from '../i18n';

/**
 * Grafische Kennzahlen ohne Bibliothek (SVG): Netzdiagramm der Ratings, Halbkreis-Tacho und
 * Ringdiagramm. Werte stehen immer auch als Text daneben (Barrierefreiheit, Druck).
 */

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Netzdiagramm 0–100 mit Werteliste. */
export function RatingRadar({ ratings, ns }: { ratings: Record<string, number>; ns: string }) {
  const t = useT();
  const entries = Object.entries(ratings);
  const n = entries.length;
  const size = 300;
  const c = size / 2;
  const r = 92;
  const angle = (i: number) => -Math.PI / 2 + (i / n) * Math.PI * 2;
  const point = (i: number, v: number) =>
    [c + Math.cos(angle(i)) * r * v, c + Math.sin(angle(i)) * r * v] as const;
  const polygon = (v: (i: number) => number) =>
    entries.map((_, i) => point(i, v(i)).join(',')).join(' ');
  const best = entries.reduce((a, b) => (b[1] > a[1] ? b : a))[0];

  return (
    <div className="radar">
      <svg
        viewBox={`-70 -10 ${size + 140} ${size + 20}`}
        role="img"
        aria-label={entries.map(([k, v]) => `${t(`${ns}.${k}`)} ${Math.round(v)}`).join(', ')}
      >
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <polygon key={f} points={polygon(() => f)} className="radar-grid" />
        ))}
        {entries.map((_, i) => {
          const [x, y] = point(i, 1);
          return <line key={i} x1={c} y1={c} x2={x} y2={y} className="radar-grid" />;
        })}
        <polygon points={polygon((i) => clamp01(entries[i]![1] / 100))} className="radar-area" />
        {entries.map(([k, v], i) => {
          const [x, y] = point(i, clamp01(v / 100));
          return <circle key={k} cx={x} cy={y} r={3} className="radar-dot" />;
        })}
        {entries.map(([k, v], i) => {
          const [x, y] = point(i, 1.2);
          const anchor = Math.abs(x - c) < 8 ? 'middle' : x > c ? 'start' : 'end';
          return (
            <text
              key={k}
              x={x}
              y={y}
              textAnchor={anchor}
              dominantBaseline="middle"
              className={k === best ? 'radar-label best' : 'radar-label'}
            >
              {t(`${ns}.${k}`)}
              <tspan className="radar-value"> {Math.round(v)}</tspan>
            </text>
          );
        })}
      </svg>
    </div>
  );
}

/** Halbkreis-Tacho: Anteil 0..1, großer Wert in der Mitte, Bezeichnung darunter. */
export function Gauge({
  label,
  value,
  fraction,
  hint,
  tone = 'accent',
}: {
  label: string;
  value: string;
  fraction: number;
  hint?: string | undefined;
  tone?: 'accent' | 'ice' | 'electric' | 'battery';
}) {
  const f = clamp01(fraction);
  const R = 52;
  const arc = (to: number) => {
    const a = Math.PI * (1 - to);
    const x = 60 + R * Math.cos(a);
    const y = 62 - R * Math.sin(a);
    return `M8 62 A${R} ${R} 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)}`;
  };
  // Zeiger als kurzer Strich am Ende des Bogens.
  const a = Math.PI * (1 - f);
  return (
    <div className="gauge">
      <svg viewBox="0 0 120 70" aria-hidden="true">
        <path d={arc(1)} className="gauge-track" />
        {f > 0.005 && <path d={arc(f)} className={`gauge-fill ${tone}`} />}
        <line
          x1={60 + (R - 9) * Math.cos(a)}
          y1={62 - (R - 9) * Math.sin(a)}
          x2={60 + (R + 7) * Math.cos(a)}
          y2={62 - (R + 7) * Math.sin(a)}
          className="gauge-needle"
        />
      </svg>
      <div className="gauge-value">{value}</div>
      <div className="gauge-label">{label}</div>
      {hint && <div className="gauge-hint">{hint}</div>}
    </div>
  );
}

const DONUT_COLORS = [
  '--chart-1',
  '--chart-2',
  '--chart-3',
  '--chart-4',
  '--chart-5',
  '--chart-6',
  '--muted',
];

/** Ringdiagramm mit Legende; kleine Anteile werden zu „Sonstiges“ zusammengefasst. */
export function Donut({
  parts,
  center,
  centerLabel,
  otherLabel,
  otherKey = 'misc',
  format,
}: {
  otherKey?: string;
  parts: { key: string; label: string; value: number }[];
  center: string;
  centerLabel: string;
  otherLabel: string;
  format: (v: number) => string;
}) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  // „other“ (z. B. Sonstiges) immer in die Sammelgruppe am Ende.
  const sorted = [...parts].filter((p) => p.key !== otherKey).sort((a, b) => b.value - a.value);
  const top = sorted.slice(0, 6);
  const rest =
    sorted.slice(6).reduce((a, p) => a + p.value, 0) +
    parts.filter((p) => p.key === otherKey).reduce((a, p) => a + p.value, 0);
  const shown = rest > 0 ? [...top, { key: 'other', label: otherLabel, value: rest }] : top;
  const R = 42;
  const C = 2 * Math.PI * R;
  // Startwinkel je Segment als kumulierte Bogenlänge.
  const lengths = shown.map((p) => (p.value / total) * C);
  const offsets = lengths.map((_, i) => lengths.slice(0, i).reduce((a, b) => a + b, 0));
  return (
    <div className="donut">
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r={R} className="donut-track" />
        {shown.map((p, i) => (
          <circle
            key={p.key}
            cx="60"
            cy="60"
            r={R}
            className="donut-seg"
            style={{ stroke: `var(${DONUT_COLORS[i]})` }}
            strokeDasharray={`${Math.max(0, lengths[i]! - 1.5)} ${C}`}
            strokeDashoffset={-offsets[i]!}
            transform="rotate(-90 60 60)"
          />
        ))}
        <text x="60" y="58" textAnchor="middle" className="donut-center">
          {center}
        </text>
        <text x="60" y="74" textAnchor="middle" className="donut-center-label">
          {centerLabel}
        </text>
      </svg>
      <ul className="donut-legend">
        {shown.map((p, i) => (
          <li key={p.key}>
            <span className="swatch" style={{ background: `var(${DONUT_COLORS[i]})` }} />
            <span>{p.label}</span>
            <span className="num">{format(p.value)}</span>
            <span className="num muted">{Math.round((p.value / total) * 100)} %</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
