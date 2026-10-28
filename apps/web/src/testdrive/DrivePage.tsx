import {
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link } from 'wouter';
import { TEST_TRACK, buildTrack, drivingModel } from '@ericmotors/physics';
import type { Car } from '@ericmotors/schema';
import { useLocale, useT } from '../i18n';
import { useSettings } from '../state/settings';
import { garage } from '../storage/db';
import { formatQuantity, unitFor } from '../units/format';
import { useCarAnalysis } from '../workers/usePhysics';
import { DRIVE_CAMERAS, type DriveCamera, type Telemetry } from './telemetry';
import { type DriveAction, KEY_BINDINGS, combineInput, formatLapTime, readGamepad } from './input';

const DriveScene = lazy(() => import('./DriveScene').then((m) => ({ default: m.DriveScene })));

const track = buildTrack(TEST_TRACK);

/** Testfahrt: das gespeicherte Auto auf der Teststrecke selbst fahren. */
export function DrivePage({ id }: { id: string }) {
  const t = useT();
  const locale = useLocale();
  const units = useSettings((s) => s.units);
  const power = useSettings((s) => s.power);
  const [car, setCar] = useState<Car | null | undefined>(undefined);
  const [camera, setCamera] = useState<DriveCamera>('chase');
  const [resetKey, setResetKey] = useState(0);
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const active = useRef(new Set<DriveAction>());
  const input = useRef(() => combineInput(active.current, readGamepad()));

  useEffect(() => {
    let cancelled = false;
    void garage.loadCar(id).then((c) => !cancelled && setCar(c ?? null));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const analysis = useCarAnalysis(car ?? undefined);
  const model = useMemo(
    () => (analysis.result ? drivingModel(analysis.result) : undefined),
    [analysis.result],
  );

  const press = useCallback((action: DriveAction, on: boolean) => {
    if (on) active.current.add(action);
    else active.current.delete(action);
  }, []);

  const nextCamera = useCallback(
    () => setCamera((c) => DRIVE_CAMERAS[(DRIVE_CAMERAS.indexOf(c) + 1) % DRIVE_CAMERAS.length]!),
    [],
  );

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const action = KEY_BINDINGS[e.code];
      if (action) {
        active.current.add(action);
        e.preventDefault();
      } else if (e.code === 'KeyC' && !e.repeat) nextCamera();
      else if (e.code === 'KeyR' && !e.repeat) setResetKey((k) => k + 1);
    };
    const up = (e: KeyboardEvent) => {
      const action = KEY_BINDINGS[e.code];
      if (action) active.current.delete(action);
    };
    // Beim Verlassen des Fensters keine „klemmenden“ Tasten.
    const blur = () => active.current.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [nextCamera]);

  if (car === undefined) return <main className="page muted">{t('common.loading')}</main>;
  if (car === null) {
    return (
      <main className="page">
        <p>{t('common.notFound')}</p>
        <Link href="/garage">{t('common.back')}</Link>
      </main>
    );
  }

  const uc = { units, power };
  const f = (
    v: number | null | undefined,
    q: Parameters<typeof formatQuantity>[1],
    digits?: number,
  ) => formatQuantity(v, q, uc, locale, digits);
  const speedUnit = unitFor('speed', uc);
  const drivable = model ? model.envelope.some((x) => x > 0) : true;

  const lap = telemetry?.lap;
  const current = lap?.lapStart != null && telemetry ? telemetry.time - lap.lapStart : null;
  const gear =
    telemetry === null ? '–' : telemetry.gear === -1 ? t('drive.reverse') : String(telemetry.gear);

  return (
    <main className="drive">
      <div className="drive-stage">
        {analysis.error && <div className="viewer-fallback">{analysis.error}</div>}
        {!drivable && (
          <div className="viewer-fallback">
            {t('drive.notDrivable', { reason: t('drive.noTraction') })}
          </div>
        )}
        {model && drivable && (
          <Suspense fallback={<div className="viewer-fallback muted">{t('drive.loading')}</div>}>
            <DriveScene
              car={car}
              model={model}
              track={track}
              input={input}
              camera={camera}
              resetKey={resetKey}
              onTelemetry={setTelemetry}
            />
          </Suspense>
        )}
        {!model && !analysis.error && (
          <div className="viewer-fallback muted">{t('common.calculating')}</div>
        )}

        <div className="drive-hud drive-top">
          <div className="drive-panel drive-title">
            <Link className="btn small" href={`/car/${car.id}`}>
              ← {t('drive.back')}
            </Link>
            <strong>{t('drive.title', { name: car.meta.name })}</strong>
          </div>
          <div className="drive-panel drive-laps" aria-live="off">
            <span className="muted">
              {t('drive.lap')} {(lap?.laps ?? 0) + 1}
            </span>
            <dl>
              <dt>{t('drive.current')}</dt>
              <dd>{formatLapTime(current)}</dd>
              <dt>{t('drive.last')}</dt>
              <dd>{formatLapTime(lap?.lastLap)}</dd>
              <dt>{t('drive.best')}</dt>
              <dd className="drive-best">{formatLapTime(lap?.bestLap)}</dd>
            </dl>
          </div>
        </div>

        <div className="drive-hud drive-bottom">
          <details className="drive-panel drive-help">
            <summary>{t('drive.help.title')}</summary>
            <ul>
              <li>
                <kbd>W</kbd> <kbd>↑</kbd> {t('drive.help.throttle')}
              </li>
              <li>
                <kbd>S</kbd> <kbd>↓</kbd> {t('drive.help.brake')}
              </li>
              <li>
                <kbd>A</kbd> <kbd>D</kbd> <kbd>←</kbd> <kbd>→</kbd> {t('drive.help.steer')}
              </li>
              <li>
                <kbd>Space</kbd> {t('drive.help.handbrake')}
              </li>
              <li>
                <kbd>C</kbd> {t('drive.help.camera')} · <kbd>R</kbd> {t('drive.help.reset')}
              </li>
              <li className="muted">{t('drive.help.gamepad')}</li>
              {analysis.result && (
                <li className="muted">
                  {t('drive.values', {
                    accel: f(analysis.result.performance.accel0to100, 'time'),
                    vmax: f(analysis.result.performance.topSpeed, 'speed'),
                    lat: `${(analysis.result.performance.lateralAcceleration / 9.81).toLocaleString(locale, { maximumFractionDigits: 2 })} g`,
                  })}
                </li>
              )}
            </ul>
          </details>

          <div className="drive-right">
            <div className="drive-panel drive-tools">
              <div className="segmented" role="group" aria-label={t('drive.camera.label')}>
                {DRIVE_CAMERAS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={camera === c}
                    onClick={() => setCamera(c)}
                  >
                    {t(`drive.camera.${c}`)}
                  </button>
                ))}
              </div>
              <button type="button" className="btn small" onClick={() => setResetKey((k) => k + 1)}>
                {t('drive.reset')}
              </button>
            </div>
            <div className="drive-panel drive-speedo">
              <div className="drive-flags">
                {telemetry?.offTrack && (
                  <span className="drive-flag warn">{t('drive.offTrack')}</span>
                )}
                {telemetry && Math.abs(telemetry.slip) > 0.12 && (
                  <span className="drive-flag">{t('drive.drifting')}</span>
                )}
              </div>
              <div className="drive-speed">
                <span className="drive-speed-value">
                  {Math.round(speedUnit.toDisplay(Math.abs(telemetry?.speed ?? 0)))}
                </span>
                <span className="muted">{speedUnit.unit}</span>
              </div>
              <div className="drive-gear">
                <span className="muted">{t('drive.gear')}</span>
                <strong>{gear}</strong>
              </div>
              <div
                className="drive-rpm"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={1}
                aria-valuenow={telemetry?.rpm ?? 0}
              >
                <span
                  style={{ width: `${Math.round((telemetry?.rpm ?? 0) * 100)}%` }}
                  className={(telemetry?.rpm ?? 0) > 0.92 ? 'redline' : undefined}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Touch-Steuerung (nur bei grobem Zeiger sichtbar) */}
        <div className="drive-touch" aria-hidden="true">
          <div>
            <TouchButton action="left" onPress={press}>
              ◀
            </TouchButton>
            <TouchButton action="right" onPress={press}>
              ▶
            </TouchButton>
          </div>
          <div>
            <TouchButton action="brake" className="brake" onPress={press}>
              {t('drive.touch.brake')}
            </TouchButton>
            <TouchButton action="throttle" className="throttle" onPress={press}>
              {t('drive.touch.throttle')}
            </TouchButton>
          </div>
        </div>
      </div>
    </main>
  );
}

/** Touch-Taste: hält eine Aktion, solange der Finger liegt. */
function TouchButton({
  action,
  className,
  onPress,
  children,
}: {
  action: DriveAction;
  className?: string;
  onPress: (action: DriveAction, on: boolean) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={className}
      onPointerDown={(e: PointerEvent) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        onPress(action, true);
      }}
      onPointerUp={() => onPress(action, false)}
      onPointerCancel={() => onPress(action, false)}
      onContextMenu={(e: MouseEvent) => e.preventDefault()}
    >
      {children}
    </button>
  );
}
