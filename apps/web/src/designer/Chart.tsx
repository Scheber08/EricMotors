import { useEffect, useRef, useState } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { useSettings } from '../state/settings';

/**
 * Liniendiagramm (uPlot) mit Fadenkreuz und Live-Werten in der Legende.
 * Eine y-Achse pro Diagramm (keine Doppelachsen); Farben kommen aus CSS-Variablen
 * (--chart-*), damit Hell/Dunkel stimmen.
 */
export interface ChartSeries {
  label: string;
  /** CSS-Variable der Farbe, z. B. „--chart-1“. */
  color: string;
  values: (number | null)[];
  dash?: number[];
  width?: number;
}

export interface ChartProps {
  title: string;
  x: number[];
  series: ChartSeries[];
  xUnit: string;
  yUnit: string;
  height?: number;
  /** Formatierung der Achsen-/Legendenwerte. */
  formatX?: (v: number) => string;
  formatY?: (v: number) => string;
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
}

/** Ändert sich bei Theme-Wechsel (Einstellung oder Systemeinstellung), damit Farben neu gelesen werden. */
function useThemeKey(): string {
  const theme = useSettings((s) => s.theme);
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setDark(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return `${theme}-${dark}`;
}

export function Chart({
  title,
  x,
  series,
  xUnit,
  yUnit,
  height = 180,
  formatX,
  formatY,
}: ChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const plot = useRef<uPlot | null>(null);
  const themeKey = useThemeKey();
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry!.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Neu aufbauen bei Struktur- oder Theme-Wechsel; Daten sonst nur aktualisieren.
  const structure = `${themeKey}|${series.map((s) => s.label + s.color).join(',')}|${xUnit}|${yUnit}`;
  useEffect(() => {
    const el = ref.current;
    if (!el || width === 0) return;
    const grid = cssVar('--chart-grid');
    const text = cssVar('--muted');
    const axis = (unit: string, fmt?: (v: number) => string): uPlot.Axis => ({
      stroke: text,
      grid: { stroke: grid, width: 1 },
      ticks: { stroke: grid, width: 1 },
      label: unit,
      labelSize: 18,
      ...(fmt ? { values: (_u: uPlot, vals: number[]) => vals.map((v) => fmt(v)) } : {}),
    });
    const opts: uPlot.Options = {
      width,
      height,
      cursor: { drag: { x: false, y: false }, points: { size: 8 } },
      legend: { live: true },
      scales: { x: { time: false } },
      axes: [axis(xUnit, formatX), axis(yUnit, formatY)],
      series: [
        {
          label: xUnit,
          value: (_u, v) =>
            v === null || v === undefined ? '–' : formatX ? formatX(v) : String(v),
        },
        ...series.map((s) => ({
          label: s.label,
          stroke: cssVar(s.color),
          width: s.width ?? 2,
          ...(s.dash ? { dash: s.dash } : {}),
          points: { show: false },
          spanGaps: false,
          value: (_u: uPlot, v: number | null) =>
            v === null || v === undefined ? '–' : formatY ? formatY(v) : v.toFixed(0),
        })),
      ],
    };
    plot.current?.destroy();
    plot.current = new uPlot(opts, [x, ...series.map((s) => s.values)] as uPlot.AlignedData, el);
    return () => {
      plot.current?.destroy();
      plot.current = null;
    };
    // Daten werden im zweiten Effekt gesetzt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structure, width, height]);

  useEffect(() => {
    plot.current?.setData([x, ...series.map((s) => s.values)] as uPlot.AlignedData);
  }, [x, series]);

  return (
    <figure className="chart">
      <figcaption>{title}</figcaption>
      <div ref={ref} />
    </figure>
  );
}
