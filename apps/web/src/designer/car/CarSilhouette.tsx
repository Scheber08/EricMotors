import { useMemo } from 'react';
import type { Car } from '@ericmotors/schema';
import { bodyLayout, sideView } from './bodyGeometry';

/**
 * Seitenansicht eines Autos als SVG – aus derselben parametrischen Form wie die 3D-Ansicht, aber
 * ohne WebGL. Für Vorlagen- und Garagenkarten (und später Listen im Spiel), wo viele Autos
 * gleichzeitig zu sehen sind.
 */
export function CarSilhouette({ car, className }: { car: Car; className?: string }) {
  const shape = useMemo(() => {
    const l = bodyLayout(car);
    const v = sideView(l);
    const pad = 0.12;
    const x0 = l.xRear - pad;
    const width = l.xFront - l.xRear + 2 * pad;
    const top = car.model.dimensions.height + 0.15;
    // SVG-Koordinaten: Front rechts, Boden unten.
    const pt = ([x, z]: [number, number]) => `${(x - x0).toFixed(3)},${(top - z).toFixed(3)}`;
    const path = (pts: [number, number][]) => `M${pts.map(pt).join('L')}Z`;
    return {
      width,
      height: top + 0.08,
      ground: top,
      body: path(v.body),
      windows: v.windows.map(path),
      wheels: l.wheels.map((w) => ({
        cx: w.x - x0,
        cy: top - w.radius,
        r: w.radius,
        rim: car.wheels.rimDiameter / 2,
      })),
      lights: {
        front: { x: l.xFront - x0, y: top - (l.noseZ - 0.05) },
        rear: { x: l.xRear - x0, y: top - (l.deckZ - 0.07) },
      },
    };
  }, [car]);
  const paint = car.paint.wrap?.color ?? car.paint.base.color;
  const rim = car.wheels.rimMaterial === 'steel' ? '#4a4f57' : '#c9ced5';
  return (
    <svg
      className={className ?? 'car-silhouette'}
      viewBox={`0 0 ${shape.width.toFixed(3)} ${shape.height.toFixed(3)}`}
      role="img"
      aria-label={car.meta.name}
    >
      <ellipse
        cx={shape.width / 2}
        cy={shape.ground}
        rx={shape.width * 0.46}
        ry={0.05}
        fill="currentColor"
        opacity="0.18"
      />
      <path d={shape.body} fill={paint} stroke="rgb(0 0 0 / 35%)" strokeWidth="0.012" />
      {shape.windows.map((d, i) => (
        <path key={i} d={d} fill="#1d2733" stroke="#06080b" strokeWidth="0.02" />
      ))}
      <rect
        x={shape.lights.front.x - 0.03}
        y={shape.lights.front.y}
        width="0.03"
        height="0.05"
        rx="0.01"
        fill="#e8f1ff"
      />
      <rect
        x={shape.lights.rear.x}
        y={shape.lights.rear.y}
        width="0.03"
        height="0.06"
        rx="0.01"
        fill="#e11d2a"
      />
      {shape.wheels.map((w, i) => (
        <g key={i}>
          <circle cx={w.cx} cy={w.cy} r={w.r} fill="#121316" />
          <circle cx={w.cx} cy={w.cy} r={w.rim} fill={rim} />
          <circle cx={w.cx} cy={w.cy} r={w.rim * 0.72} fill="#2a2d33" />
          <circle cx={w.cx} cy={w.cy} r={w.rim * 0.22} fill={rim} />
        </g>
      ))}
    </svg>
  );
}
