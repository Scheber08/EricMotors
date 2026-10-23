import type { CarAnalysis } from '@ericmotors/physics';
import { kwhOf, unitPeakPower } from '@ericmotors/physics';
import type { Car } from '@ericmotors/schema';
import { useLocale, useT } from '../../i18n';
import { useSettings } from '../../state/settings';
import { formatQuantity } from '../../units/format';

/**
 * Antriebs-Schema in Draufsicht (Front links): Karosserieumriss, Räder, Achsen, Verbrenner mit
 * Getriebe, E-Motoren, Batterie und Tank an ihrer berechneten Lage. Angetriebene Achsen sind
 * hervorgehoben; Bauteile sind anklickbar und springen zu ihren Einstellungen.
 */
export function PowertrainDiagram({
  car,
  analysis,
  onSelect,
}: {
  car: Car;
  analysis: CarAnalysis | undefined;
  onSelect: (id: string) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const units = useSettings((s) => s.units);
  const power = useSettings((s) => s.power);
  const fmt = (v: number, q: 'power' | 'energy') => formatQuantity(v, q, { units, power }, locale);

  const W = 340;
  const H = 190;
  const d = car.model.dimensions;
  const scale = Math.min((W - 30) / d.length, (H - 76) / d.width);
  const bodyL = d.length * scale;
  const bodyW = d.width * scale;
  const x0 = (W - bodyL) / 2;
  const y0 = 22 + (H - 56 - bodyW) / 2;
  const cy = y0 + bodyW / 2;
  const frontX = x0 + d.overhangFront * scale;
  const rearX = frontX + d.wheelbase * scale;
  // Fahrzeugkoordinate x (0 = Vorderachse, negativ nach hinten) → Bild-x.
  const px = (x: number) => frontX - x * scale;

  const pt = car.powertrain;
  const layout = car.drivetrain.layout;
  const motorAt = (axle: 'front' | 'rear') => pt.motors.find((m) => m.position === axle);
  const engineDriven = (axle: 'front' | 'rear') =>
    !!pt.engine && (layout === 'awd' || layout === (axle === 'front' ? 'fwd' : 'rwd'));
  const driven = (axle: 'front' | 'rear') => engineDriven(axle) || !!motorAt(axle);

  const tireW = Math.max(car.wheels.front.width, car.wheels.rear.width) * scale * 1.4;
  const tireL = (car.wheels.rimDiameter + 0.2) * scale;
  const trackHalf = (axle: 'front' | 'rear') =>
    (bodyW / 2) * (axle === 'front' ? d.trackFront : d.trackRear) * 1.05;

  const items = analysis?.mass.items ?? [];
  const engineItem = items.find((i) => i.group === 'engine');
  const motorItems = items.filter((i) => i.group === 'motors');
  const batteryItem = items.find((i) => i.group === 'battery');
  const fuelItem = items.find((i) => i.group === 'fuel');

  // Verbrenner-Block
  const dims = analysis?.engine?.dimensions;
  const transverse = pt.engine?.placement.endsWith('transverse') ?? false;
  const engineBox =
    pt.engine && dims && engineItem
      ? (() => {
          const l = (transverse ? dims.width : dims.length) * scale;
          const w = (transverse ? dims.length : dims.width) * scale;
          return { x: px(engineItem.x) - l / 2, y: cy - w / 2, l, w };
        })()
      : undefined;
  const gearbox = engineBox
    ? transverse
      ? { x: engineBox.x + engineBox.l * 0.15, y: engineBox.y + engineBox.w, l: 16, w: 12 }
      : {
          x: pt.engine!.placement.startsWith('front')
            ? engineBox.x + engineBox.l
            : engineBox.x - 18,
          y: cy - 7,
          l: 18,
          w: 14,
        }
    : undefined;
  const gearboxCenter = gearbox && { x: gearbox.x + gearbox.l / 2, y: gearbox.y + gearbox.w / 2 };

  const axle = (which: 'front' | 'rear') => {
    const x = which === 'front' ? frontX : rearX;
    const half = trackHalf(which);
    const on = driven(which);
    return (
      <g key={which}>
        <line
          x1={x}
          y1={cy - half}
          x2={x}
          y2={cy + half}
          className={on ? 'pd-shaft driven' : 'pd-shaft'}
        />
        {[-1, 1].map((s) => (
          <rect
            key={s}
            x={x - tireL / 2}
            y={cy + s * half - tireW / 2}
            width={tireL}
            height={tireW}
            rx={3}
            className={on ? 'pd-wheel driven' : 'pd-wheel'}
          />
        ))}
      </g>
    );
  };

  const motorGlyph = (m: Car['powertrain']['motors'][number], idx: number) => {
    const item = motorItems[idx];
    const x =
      m.position === 'front'
        ? frontX
        : m.position === 'rear'
          ? rearX
          : (gearboxCenter?.x ?? (item ? px(item.x) : frontX + 30));
    const y = m.position === 'gearbox' ? (gearboxCenter?.y ?? cy) : cy;
    const r = Math.max(7, Math.min(14, 5 + Math.sqrt(m.peakPower / 1000) * 0.55));
    const centers =
      m.count === 2 && m.position !== 'gearbox'
        ? [
            [x, y - trackHalf(m.position) * 0.45],
            [x, y + trackHalf(m.position) * 0.45],
          ]
        : [[x, y]];
    const labelY = y + (m.position === 'gearbox' ? 0 : trackHalf(m.position)) + tireW / 2 + 15;
    return (
      <g
        key={m.id}
        className="pd-part pd-motor"
        role="button"
        tabIndex={0}
        aria-label={t('designer.motorTitle', {
          position: t(`options.params.car.motorPosition.${m.position}`),
        })}
        onClick={() => onSelect(`motor-${m.position}`)}
        onKeyDown={(e) => e.key === 'Enter' && onSelect(`motor-${m.position}`)}
      >
        {centers.map(([cx2, cy2], i) => (
          <g key={i}>
            <circle cx={cx2} cy={cy2} r={r} />
            <path
              d={`M${cx2! + 1} ${cy2! - r * 0.55}l-${r * 0.35} ${r * 0.55}h${r * 0.4}l-${r * 0.3} ${r * 0.55}`}
              className="pd-bolt"
            />
          </g>
        ))}
        {m.position !== 'gearbox' && (
          <text x={x} y={labelY} textAnchor="middle" className="pd-label">
            {fmt(unitPeakPower(m), 'power')}
          </text>
        )}
      </g>
    );
  };

  const battery =
    pt.battery &&
    (() => {
      const floor = pt.type === 'electric';
      const l = floor
        ? (rearX - frontX) * 0.72
        : Math.max(18, Math.min(50, kwhOf(pt.battery) * 2.5));
      const w = floor ? trackHalf('rear') * 1.35 : Math.max(16, l * 0.8);
      // Hybridbatterie unter der Rückbank, vor der Hinterachse (frei von Achsmotor und Tank).
      const cx2 = floor
        ? batteryItem
          ? px(batteryItem.x)
          : (frontX + rearX) / 2
        : rearX - tireL / 2 - l / 2 - 8;
      const x = Math.min(Math.max(cx2 - l / 2, x0 + 4), x0 + bodyL - l - 4);
      const cells = Math.max(2, Math.min(12, Math.round(l / 14)));
      return (
        <g
          className="pd-part pd-battery"
          role="button"
          tabIndex={0}
          aria-label={t('designer.battery')}
          onClick={() => onSelect('battery')}
          onKeyDown={(e) => e.key === 'Enter' && onSelect('battery')}
        >
          <rect x={x} y={cy - w / 2} width={l} height={w} rx={4} />
          {Array.from({ length: cells - 1 }, (_, i) => (
            <line
              key={i}
              x1={x + ((i + 1) * l) / cells}
              y1={cy - w / 2 + 3}
              x2={x + ((i + 1) * l) / cells}
              y2={cy + w / 2 - 3}
              className="pd-cell"
            />
          ))}
          <text
            x={x + l / 2}
            y={l < 60 ? cy - w / 2 - 6 : cy + 4}
            textAnchor="middle"
            className="pd-label strong"
          >
            {fmt(pt.battery!.capacity, 'energy')}
          </text>
        </g>
      );
    })();

  // Wellen vom Getriebe zu den angetriebenen Achsen
  const shafts =
    gearboxCenter &&
    (['front', 'rear'] as const).filter(engineDriven).map((a) => {
      const ax = a === 'front' ? frontX : rearX;
      return (
        <path
          key={a}
          d={`M${gearboxCenter.x} ${gearboxCenter.y} L${ax} ${cy}`}
          className="pd-shaft driven"
        />
      );
    });

  return (
    <figure className="powertrain-diagram">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('designer.powertrainDiagram')}>
        <rect
          x={x0}
          y={y0}
          width={bodyL}
          height={bodyW}
          rx={Math.min(bodyW * 0.35, 40)}
          className="pd-body"
        />
        <text x={x0 - 4} y={cy} textAnchor="end" dominantBaseline="middle" className="pd-dir">
          ◀
        </text>
        {axle('front')}
        {axle('rear')}
        {shafts}
        {fuelItem && pt.engine && (
          <rect
            x={px(fuelItem.x) - 10 + (pt.battery ? 26 : 0)}
            y={cy - bodyW * 0.22}
            width={20}
            height={bodyW * 0.44}
            rx={3}
            className="pd-tank"
          />
        )}
        {battery}
        {engineBox && (
          <g
            className="pd-part pd-engine"
            role="button"
            tabIndex={0}
            aria-label={t('sections.car.engine')}
            onClick={() => onSelect('engine')}
            onKeyDown={(e) => e.key === 'Enter' && onSelect('engine')}
          >
            <rect x={engineBox.x} y={engineBox.y} width={engineBox.l} height={engineBox.w} rx={3} />
            {Array.from({ length: Math.min(pt.engine!.family.cylinders, 12) }, (_, i) => {
              const n = Math.min(pt.engine!.family.cylinders, 12);
              const along = transverse ? engineBox.w : engineBox.l;
              const pos = ((i + 0.5) / n) * along;
              return transverse ? (
                <circle key={i} cx={engineBox.x + engineBox.l / 2} cy={engineBox.y + pos} r={2} />
              ) : (
                <circle key={i} cx={engineBox.x + pos} cy={cy} r={2} />
              );
            })}
          </g>
        )}
        {gearbox && (
          <rect
            x={gearbox.x}
            y={gearbox.y}
            width={gearbox.l}
            height={gearbox.w}
            rx={2}
            className="pd-gearbox"
          />
        )}
        {pt.motors.map(motorGlyph)}
      </svg>
      {analysis && (
        <figcaption className="pd-summary">
          <span>
            <strong>{fmt(analysis.powertrain.systemPower, 'power')}</strong>{' '}
            {t('designer.systemPower')}
          </span>
          {analysis.powertrain.enginePower > 0 && (
            <span className="pd-key ice">{fmt(analysis.powertrain.enginePower, 'power')}</span>
          )}
          {analysis.powertrain.electricPower > 0 && (
            <span className="pd-key electric">
              {fmt(analysis.powertrain.electricPower, 'power')}
            </span>
          )}
          {analysis.powertrain.batteryPower !== null && (
            <span className="pd-key battery">
              {t('designer.batteryPower', {
                value: fmt(analysis.powertrain.batteryPower, 'power'),
              })}
            </span>
          )}
        </figcaption>
      )}
    </figure>
  );
}
