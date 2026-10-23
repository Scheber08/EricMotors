import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import type { CarAnalysis } from '@ericmotors/physics';
import {
  BodyShape,
  Car,
  type CarEngine,
  ENGINE_TEMPLATES,
  type Engine,
  type EngineTemplateId,
  carEngineFrom,
} from '@ericmotors/schema';
import { ENGINE_TEMPLATE_IDS } from '../app/templates';
import { useLocale, useT } from '../i18n';
import { setPath } from '../lib/path';
import { useCarDocument, useHistory } from '../state/document';
import { useSettings } from '../state/settings';
import { type DocSummary, garage, newId } from '../storage/db';
import { formatQuantity, unitFor } from '../units/format';
import { useCarAnalysis } from '../workers/usePhysics';
import { Chart } from './Chart';
import { CloudPanel } from './CloudPanel';
import { captureViewer } from './thumbnail';
import { DesignerShell, type SectionDef } from './DesignerShell';
import { normalizeCar, setGearCount } from './carNormalize';
import type { ViewMode } from './car/CarViewer';
import {
  ColorField,
  type FieldContext,
  FieldGroup,
  NumberField,
  QualityField,
  SelectField,
  SliderField,
  ToggleField,
} from './fields';
import { RatingBars, Stat, WarningList } from './Stats';
import { useAutosave } from './useAutosave';

const CarViewer = lazy(() => import('./car/CarViewer').then((m) => ({ default: m.CarViewer })));

const SECTIONS = [
  'model',
  'engine',
  'trim',
  'drivetrain',
  'suspension',
  'wheels',
  'brakes',
  'aero',
  'paint',
] as const;
type Section = (typeof SECTIONS)[number];

const mm = (x: number) => x / 1000;
const inch = (x: number) => x * 0.0254;
const deg = (x: number) => (x * Math.PI) / 180;

/** Abschnitt, zu dem eine Warnung gehört (aus dem Pfad). */
function sectionOf(path: string): Section {
  const head = path.split('.')[0]!;
  if (head === 'engine' || head === 'powertrain') return 'engine';
  if (head === 'aero') return 'aero';
  return (SECTIONS as readonly string[]).includes(head) ? (head as Section) : 'model';
}

export function CarDesigner({ id }: { id: string }) {
  const t = useT();
  const car = useCarDocument((s) => s.doc);
  const { load, update } = useCarDocument.getState();
  const history = useHistory(useCarDocument);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [section, setSection] = useState<Section>('model');
  const [view, setView] = useState<ViewMode>('normal');

  useEffect(() => {
    let cancelled = false;
    void garage.loadCar(id).then((c) => {
      if (cancelled) return;
      load(c);
      setStatus(c ? 'ready' : 'missing');
    });
    return () => {
      cancelled = true;
    };
  }, [id, load]);

  const valid = useMemo(() => (car ? Car.safeParse(car).success : false), [car]);
  const save = useCallback(async (c: Car) => {
    if (Car.safeParse(c).success) await garage.saveCar(c);
  }, []);
  const saveState = useAutosave(car, save);
  const analysis = useCarAnalysis(car);

  if (status === 'loading') return <main className="page muted">{t('common.loading')}</main>;
  if (!car) {
    return (
      <main className="page">
        <p>{t('common.notFound')}</p>
        <Link href="/garage">{t('common.back')}</Link>
      </main>
    );
  }

  const flagged = new Set(
    (analysis.result?.warnings ?? []).map((w) =>
      w.path.replace(/^engine\.variant\./, 'engine.variant.'),
    ),
  );
  const ctx: FieldContext = {
    doc: car,
    ns: 'params.car',
    flagged,
    onChange: (path, value) =>
      update((draft) => {
        setPath(draft, path, value);
        normalizeCar(draft, path);
      }),
  };
  const sections: SectionDef[] = SECTIONS.map((s) => ({ id: s, label: t(`sections.car.${s}`) }));

  return (
    <DesignerShell
      title={car.meta.name}
      onRename={(name) => update((d) => (d.meta.name = name))}
      sections={sections}
      active={section}
      onSelect={(s) => setSection(s as Section)}
      history={history}
      saveState={valid ? saveState : 'invalid'}
      actions={
        <CloudPanel
          kind="car"
          doc={car}
          blocked={
            !valid || (analysis.result?.warnings.some((w) => w.severity === 'error') ?? true)
          }
          stats={
            analysis.result && {
              powerW: analysis.result.powertrain.systemPower,
              torqueNm: analysis.result.engine?.curve.peakTorque.torque ?? 0,
              massKg: analysis.result.mass.total,
              accelS: analysis.result.performance.accel0to100,
              topSpeedMs: analysis.result.performance.topSpeed,
              costEur: analysis.result.cost.total,
            }
          }
          thumbnail={() => captureViewer(document.querySelector('.viewer'))}
        />
      }
      center={
        <div className="car-center">
          <div className="viewer">
            <Suspense fallback={<div className="viewer-fallback muted">{t('common.loading')}</div>}>
              <CarViewer
                car={car}
                analysis={analysis.result}
                mode={view}
                onSelect={(s) => setSection(s as Section)}
              />
            </Suspense>
            <div className="viewer-modes segmented" role="group" aria-label={t('designer.view')}>
              {(['normal', 'xray', 'exploded'] as const).map((m) => (
                <button key={m} type="button" aria-pressed={view === m} onClick={() => setView(m)}>
                  {t(`designer.views.${m}`)}
                </button>
              ))}
            </div>
          </div>
          <CarOutput
            car={car}
            analysis={analysis.result}
            error={analysis.error}
            onWarning={(path) => setSection(sectionOf(path))}
          />
        </div>
      }
      params={<CarParams section={section} car={car} ctx={ctx} />}
    />
  );
}

function CarParams({ section, car, ctx }: { section: Section; car: Car; ctx: FieldContext }) {
  const t = useT();
  const { update } = useCarDocument.getState();
  const dt = car.drivetrain;
  switch (section) {
    case 'model':
      return (
        <>
          <FieldGroup title={t('sections.car.model')}>
            <SelectField ctx={ctx} path="model.shape" options={BodyShape.options} />
            <NumberField
              ctx={ctx}
              path="model.dimensions.length"
              quantity="length"
              min={2.8}
              max={6.5}
              step={0.01}
            />
            <NumberField
              ctx={ctx}
              path="model.dimensions.width"
              quantity="length"
              min={1.4}
              max={2.4}
              step={0.01}
            />
            <NumberField
              ctx={ctx}
              path="model.dimensions.height"
              quantity="length"
              min={0.95}
              max={2.2}
              step={0.01}
            />
            <NumberField
              ctx={ctx}
              path="model.dimensions.wheelbase"
              quantity="length"
              min={1.9}
              max={Math.min(
                4.2,
                car.model.dimensions.length - car.model.dimensions.overhangFront - 0.3,
              )}
              step={0.01}
            />
            <NumberField
              ctx={ctx}
              path="model.dimensions.overhangFront"
              quantity="length"
              min={0.4}
              max={1.5}
              step={0.01}
            />
            <SliderField ctx={ctx} path="model.dimensions.trackFront" engineer />
            <SliderField ctx={ctx} path="model.dimensions.trackRear" engineer />
          </FieldGroup>
          <FieldGroup title={t('designer.shape')}>
            {(Object.keys(car.model.morph) as (keyof Car['model']['morph'])[]).map((k) => (
              <SliderField key={k} ctx={ctx} path={`model.morph.${k}`} />
            ))}
          </FieldGroup>
          <FieldGroup title={t('designer.chassis')}>
            <SelectField
              ctx={ctx}
              path="model.chassis"
              options={['monocoque', 'ladder', 'spaceframe']}
            />
            <SelectField
              ctx={ctx}
              path="model.chassisMaterial"
              options={['steel', 'galvanised-steel', 'aluminium', 'cfrp']}
              optionKey="bodyMaterial"
            />
            <SelectField
              ctx={ctx}
              path="model.frontSuspension"
              options={['solid-axle', 'macpherson', 'double-wishbone', 'pushrod']}
              optionKey="suspensionType"
            />
            <SelectField
              ctx={ctx}
              path="model.rearSuspension"
              options={[
                'solid-axle',
                'torsion-beam',
                'semi-trailing',
                'multi-link',
                'double-wishbone',
                'pushrod',
              ]}
              optionKey="suspensionType"
            />
            <QualityField ctx={ctx} path="model.quality" />
          </FieldGroup>
        </>
      );
    case 'engine':
      return car.powertrain.engine ? (
        <EngineSection car={car} engine={car.powertrain.engine} ctx={ctx} />
      ) : null;
    case 'trim':
      return (
        <FieldGroup title={t('sections.car.trim')}>
          <SelectField
            ctx={ctx}
            path="trim.bodyMaterial"
            options={['steel', 'galvanised-steel', 'aluminium', 'fibreglass', 'cfrp']}
            optionKey="bodyMaterial"
          />
          <SelectField
            ctx={ctx}
            path="trim.interior"
            options={['basic', 'standard', 'premium', 'luxury', 'sport', 'race']}
          />
          <SelectField
            ctx={ctx}
            path="trim.seats"
            options={car.model.shape === 'roadster' ? [1, 2] : [1, 2, 3, 4, 5, 6, 7, 8, 9]}
          />
          <SelectField
            ctx={ctx}
            path="trim.entertainment"
            options={['none', 'radio', 'infotainment', 'premium-infotainment']}
          />
          <SelectField
            ctx={ctx}
            path="trim.safety"
            options={['basic', 'standard', 'advanced', 'modern']}
          />
          <SelectField
            ctx={ctx}
            path="trim.powerSteering"
            options={['none', 'hydraulic', 'electric']}
          />
          <ToggleField ctx={ctx} path="trim.assists.abs" />
          <ToggleField ctx={ctx} path="trim.assists.tcs" />
          <ToggleField ctx={ctx} path="trim.assists.esc" />
          <ToggleField ctx={ctx} path="trim.assists.launchControl" />
          <QualityField ctx={ctx} path="trim.quality" />
        </FieldGroup>
      );
    case 'drivetrain':
      return (
        <FieldGroup title={t('sections.car.drivetrain')}>
          <SelectField ctx={ctx} path="drivetrain.layout" options={['fwd', 'rwd', 'awd']} />
          {dt.layout === 'awd' && <SliderField ctx={ctx} path="drivetrain.awdFrontShare" />}
          <SelectField
            ctx={ctx}
            path="drivetrain.gearbox"
            options={['manual', 'automatic', 'dct', 'sequential', 'cvt']}
          />
          {dt.gearbox !== 'cvt' && (
            <div className="field">
              <div className="field-label">
                <label htmlFor="gear-count">{t('params.car.gears')}</label>
              </div>
              <select
                id="gear-count"
                className="select"
                value={dt.ratios.length}
                onChange={(e) => update((d) => setGearCount(d, Number(e.target.value)))}
              >
                {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          )}
          {dt.ratios.map((_, i) => (
            <NumberField
              key={`${dt.ratios.length}-${i}`}
              ctx={ctx}
              path={`drivetrain.ratios.${i}`}
              label={dt.gearbox === 'cvt' ? (i === 0 ? 'cvtLow' : 'cvtHigh') : 'ratio'}
              quantity="ratio"
              min={0.3}
              max={7}
              step={0.01}
            />
          ))}
          <NumberField
            ctx={ctx}
            path="drivetrain.finalDrive"
            quantity="ratio"
            min={1.5}
            max={7}
            step={0.01}
          />
          <SelectField
            ctx={ctx}
            path="drivetrain.differential"
            options={['open', 'viscous', 'plate-lsd', 'torsen', 'active']}
          />
          <QualityField ctx={ctx} path="drivetrain.quality" />
        </FieldGroup>
      );
    case 'suspension':
      return (
        <>
          <FieldGroup title={t('sections.car.suspension')}>
            <SelectField
              ctx={ctx}
              path="suspension.springs"
              options={['passive', 'progressive', 'hydropneumatic', 'air']}
            />
            <SelectField
              ctx={ctx}
              path="suspension.dampers"
              options={['twin-tube', 'mono-tube', 'adaptive']}
            />
            <SelectField
              ctx={ctx}
              path="suspension.antiRoll"
              options={['none', 'passive', 'active']}
            />
            <NumberField
              ctx={ctx}
              path="suspension.rideHeight"
              quantity="smallLength"
              min={0.05}
              max={0.35}
              step={0.001}
            />
            <QualityField ctx={ctx} path="suspension.quality" />
          </FieldGroup>
          {(['front', 'rear'] as const).map((axle) => (
            <FieldGroup key={axle} title={t(`designer.${axle}`)}>
              <SliderField ctx={ctx} path={`suspension.${axle}.springStiffness`} />
              <SliderField ctx={ctx} path={`suspension.${axle}.damping`} />
              <SliderField ctx={ctx} path={`suspension.${axle}.antiRollBar`} />
              <NumberField
                ctx={ctx}
                path={`suspension.${axle}.camber`}
                quantity="angle"
                min={-0.09}
                max={0.02}
                step={deg(0.1)}
              />
            </FieldGroup>
          ))}
        </>
      );
    case 'wheels':
      return (
        <>
          <FieldGroup title={t('sections.car.wheels')}>
            <SelectField
              ctx={ctx}
              path="wheels.tireType"
              options={['eco', 'touring', 'sport', 'semi-slick', 'slick', 'all-terrain', 'offroad']}
            />
            <NumberField
              ctx={ctx}
              path="wheels.rimDiameter"
              quantity="smallLength"
              min={inch(12)}
              max={inch(22)}
              step={inch(1)}
            />
            <SelectField
              ctx={ctx}
              path="wheels.rimMaterial"
              options={['steel', 'alloy', 'forged', 'magnesium', 'cfrp']}
            />
            <SelectField
              ctx={ctx}
              path="wheels.rimDesign"
              options={['steel', 'five-spoke', 'multi-spoke', 'mesh', 'aero']}
            />
            <QualityField ctx={ctx} path="wheels.quality" />
          </FieldGroup>
          {(['front', 'rear'] as const).map((axle) => (
            <FieldGroup key={axle} title={t(`designer.${axle}`)}>
              <NumberField
                ctx={ctx}
                path={`wheels.${axle}.width`}
                quantity="smallLength"
                min={mm(125)}
                max={mm(355)}
                step={mm(10)}
              />
              <SliderField ctx={ctx} path={`wheels.${axle}.aspectRatio`} />
            </FieldGroup>
          ))}
        </>
      );
    case 'brakes':
      return (
        <>
          <FieldGroup title={t('sections.car.brakes')}>
            <SelectField
              ctx={ctx}
              path="brakes.pads"
              options={['organic', 'semi-metallic', 'ceramic', 'race']}
            />
            <SliderField ctx={ctx} path="brakes.bias" />
            <QualityField ctx={ctx} path="brakes.quality" />
          </FieldGroup>
          {(['front', 'rear'] as const).map((axle) => (
            <FieldGroup key={axle} title={t(`designer.${axle}`)}>
              <SelectField
                ctx={ctx}
                path={`brakes.${axle}.type`}
                options={['drum', 'solid-disc', 'vented-disc', 'carbon-ceramic']}
              />
              <NumberField
                ctx={ctx}
                path={`brakes.${axle}.diameter`}
                quantity="smallLength"
                min={0.2}
                max={0.42}
                step={mm(2)}
              />
              <SelectField ctx={ctx} path={`brakes.${axle}.pistons`} options={[1, 2, 4, 6, 8]} />
            </FieldGroup>
          ))}
        </>
      );
    case 'aero':
      return (
        <FieldGroup title={t('sections.car.aero')}>
          <SliderField ctx={ctx} path="aero.frontDownforce" />
          <SliderField ctx={ctx} path="aero.rearDownforce" />
          <SelectField ctx={ctx} path="aero.undertray" options={['none', 'partial', 'full']} />
          <SliderField ctx={ctx} path="aero.cooling" />
        </FieldGroup>
      );
    case 'paint':
      return <PaintSection car={car} ctx={ctx} />;
  }
}

function PaintSection({ car, ctx }: { car: Car; ctx: FieldContext }) {
  const t = useT();
  const { update } = useCarDocument.getState();
  const finishes = ['solid', 'metallic', 'pearl', 'matte', 'satin', 'chrome'] as const;
  const layerFields = (prefix: string, finish: string) => (
    <>
      <ColorField ctx={ctx} path={`${prefix}.color`} />
      <SelectField
        ctx={ctx}
        path={`${prefix}.finish`}
        options={finishes}
        optionKey="params.car.finish"
      />
      {(finish === 'metallic' || finish === 'pearl') && (
        <SliderField ctx={ctx} path={`${prefix}.flake`} />
      )}
      {finish === 'pearl' && <ColorField ctx={ctx} path={`${prefix}.pearlColor`} />}
      <SliderField ctx={ctx} path={`${prefix}.clearcoat`} />
    </>
  );
  const zones = ['roof', 'hood', 'lower'] as const;
  return (
    <>
      <FieldGroup title={t('sections.car.paint')}>
        {layerFields('paint.base', car.paint.base.finish)}
      </FieldGroup>
      <FieldGroup title={t('designer.zones')}>
        {zones.map((zone) => {
          const idx = car.paint.zones.findIndex((z) => z.zone === zone);
          return (
            <div key={zone} className="zone">
              <label className="field toggle">
                <span className="field-label">{t(`options.paintZone.${zone}`)}</span>
                <input
                  type="checkbox"
                  checked={idx >= 0}
                  onChange={(e) =>
                    update((d) => {
                      if (e.target.checked)
                        d.paint.zones.push({
                          zone,
                          layer: { color: '#111111', finish: 'solid', flake: 0, clearcoat: 0.8 },
                        });
                      else d.paint.zones = d.paint.zones.filter((z) => z.zone !== zone);
                    })
                  }
                />
              </label>
              {idx >= 0 &&
                layerFields(`paint.zones.${idx}.layer`, car.paint.zones[idx]!.layer.finish)}
            </div>
          );
        })}
      </FieldGroup>
      <FieldGroup title={t('designer.wrap')}>
        <label className="field toggle">
          <span className="field-label">{t('designer.wrapEnabled')}</span>
          <input
            type="checkbox"
            checked={!!car.paint.wrap}
            onChange={(e) =>
              update((d) => {
                if (e.target.checked)
                  d.paint.wrap = { color: '#2b2d42', finish: 'satin', flake: 0, clearcoat: 0.2 };
                else delete d.paint.wrap;
              })
            }
          />
        </label>
        {car.paint.wrap && layerFields('paint.wrap', car.paint.wrap.finish)}
      </FieldGroup>
    </>
  );
}

/** Motorwahl: aus der eigenen Motor-Bibliothek oder einer Vorlage, plus Einbaulage. */
function EngineSection({
  car,
  engine: carEngine,
  ctx,
}: {
  car: Car;
  engine: CarEngine;
  ctx: FieldContext;
}) {
  const t = useT();
  const locale = useLocale();
  const { update } = useCarDocument.getState();
  const [library, setLibrary] = useState<DocSummary[]>([]);
  const [selected, setSelected] = useState<Engine | undefined>();
  useEffect(() => {
    void garage.listEngines().then(setLibrary);
  }, []);
  useEffect(() => {
    const engineId = carEngine.source?.engineId;
    if (!engineId) return;
    void garage.loadEngine(engineId).then(setSelected);
  }, [carEngine.source?.engineId]);

  const install = (engine: Engine, variantId: string) => {
    const index = Math.max(
      0,
      engine.variants.findIndex((v) => v.id === variantId),
    );
    update((d) => {
      d.powertrain.engine = carEngineFrom(engine, d.powertrain.engine!.placement, index);
    });
  };
  const onPick = async (value: string) => {
    if (value.startsWith('template:')) {
      const engine = ENGINE_TEMPLATES[value.slice(9) as EngineTemplateId]();
      install(engine, engine.variants[0]!.id);
      setSelected(undefined);
    } else if (value) {
      const engine = await garage.loadEngine(value);
      if (engine) {
        setSelected(engine);
        install(engine, engine.variants[0]!.id);
      }
    }
  };
  const libraryVariant = selected?.variants.find((v) => v.id === carEngine.source?.variantId);
  const fam = carEngine.family;
  const liters = (
    (Math.PI / 4) *
    carEngine.variant.bore ** 2 *
    carEngine.variant.stroke *
    fam.cylinders *
    1000
  ).toFixed(1);
  const summary = `${t('designer.engineSummary', {
    layout: t(`options.params.engine.layout.${fam.layout}`),
    cylinders: fam.cylinders,
    liters: Number(liters).toLocaleString(locale, { minimumFractionDigits: 1 }),
  })} · ${carEngine.variant.name}`;
  const adopt = async () => {
    const engine: Engine = {
      schemaVersion: 1,
      kind: 'engine',
      id: newId(),
      meta: { name: t('designer.engineOf', { name: car.meta.name }), description: '', tags: [] },
      family: structuredClone(carEngine.family),
      variants: [structuredClone(carEngine.variant)],
    };
    await garage.saveEngine(engine);
    setSelected(engine);
    setLibrary(await garage.listEngines());
    update(
      (d) =>
        (d.powertrain.engine!.source = { engineId: engine.id, variantId: engine.variants[0]!.id }),
    );
  };
  const outdated =
    !!libraryVariant && JSON.stringify(libraryVariant) !== JSON.stringify(carEngine.variant);

  return (
    <FieldGroup title={t('sections.car.engine')}>
      <div className="engine-summary card">
        <strong>{selected?.meta.name ?? t('designer.embeddedEngine')}</strong>
        <span className="muted">{summary}</span>
        {!selected && (
          <button type="button" className="btn small" onClick={() => void adopt()}>
            {t('designer.adoptEngine')}
          </button>
        )}
        {carEngine.source && selected && (
          <Link className="btn small" href={`/engine/${selected.id}`}>
            {t('designer.editEngine')}
          </Link>
        )}
        {outdated && selected && (
          <button
            type="button"
            className="btn small primary"
            onClick={() => install(selected, libraryVariant.id)}
          >
            {t('designer.updateEngine')}
          </button>
        )}
      </div>
      <div className="field">
        <div className="field-label">
          <label htmlFor="engine-pick">{t('designer.chooseEngine')}</label>
        </div>
        <select
          id="engine-pick"
          className="select"
          value=""
          onChange={(e) => void onPick(e.target.value)}
        >
          <option value="">…</option>
          {library.length > 0 && (
            <optgroup label={t('garage.engines')}>
              {library.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label={t('home.templates')}>
            {ENGINE_TEMPLATE_IDS.map((id) => (
              <option key={id} value={`template:${id}`}>
                {t(`templates.engine.${id}`)}
              </option>
            ))}
          </optgroup>
        </select>
      </div>
      {selected && selected.variants.length > 1 && (
        <div className="field">
          <div className="field-label">
            <label htmlFor="variant-pick">{t('designer.variants')}</label>
          </div>
          <select
            id="variant-pick"
            className="select"
            value={carEngine.source?.variantId}
            onChange={(e) => install(selected, e.target.value)}
          >
            {selected.variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <SelectField
        ctx={ctx}
        path="engine.placement"
        options={
          [
            'front-longitudinal',
            'front-transverse',
            'mid-longitudinal',
            'mid-transverse',
            'rear-longitudinal',
          ] satisfies CarEngine['placement'][]
        }
      />
    </FieldGroup>
  );
}

export function CarOutput({
  car,
  analysis,
  error,
  onWarning,
}: {
  car: Car;
  analysis: CarAnalysis | undefined;
  error: string | undefined;
  onWarning: (path: string) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const units = useSettings((s) => s.units);
  const power = useSettings((s) => s.power);
  const engineer = useSettings((s) => s.mode === 'engineer');
  const uc = { units, power };

  const traction = useMemo(() => {
    if (!analysis) return undefined;
    const speedUnit = unitFor('speed', uc);
    const forceToDisplay = (n: number) => n / 1000;
    const vMax = Math.min(120, analysis.performance.topSpeed * 1.15);
    const grid: number[] = [];
    for (let v = 0; v <= vMax; v += 0.5) grid.push(v);
    const interp = (pts: { speed: number; force: number }[], v: number) => {
      if (pts.length === 0 || v < pts[0]!.speed || v > pts.at(-1)!.speed) return null;
      let i = 1;
      while (i < pts.length && pts[i]!.speed < v) i++;
      const a = pts[i - 1]!;
      const b = pts[Math.min(i, pts.length - 1)]!;
      return b.speed === a.speed
        ? forceToDisplay(a.force)
        : forceToDisplay(a.force + ((b.force - a.force) * (v - a.speed)) / (b.speed - a.speed));
    };
    return {
      x: grid.map((v) => speedUnit.toDisplay(v)),
      unit: speedUnit.unit,
      gears: analysis.performance.traction.map((c) => grid.map((v) => interp(c.points, v))),
      resistance: grid.map((v) => interp(analysis.performance.resistance, v)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis, units, power]);

  if (!analysis || !traction)
    return <div className="output muted">{error ?? t('common.calculating')}</div>;
  const p = analysis.performance;
  const f = (
    v: number | null | undefined,
    q: Parameters<typeof formatQuantity>[1],
    digits?: number,
  ) => formatQuantity(v, q, uc, locale, digits);
  const powerToMass = analysis.powertrain.systemPower / analysis.mass.total;
  const pwUnit = unitFor('power', uc);
  const massUnit = unitFor('mass', uc);
  const groups = analysis.mass.items.reduce<Record<string, number>>(
    (acc, i) => ({ ...acc, [i.group]: (acc[i.group] ?? 0) + i.mass }),
    {},
  );

  return (
    <div className="output">
      <div className="stats">
        <Stat
          label={t('stats.car.power')}
          value={f(analysis.powertrain.systemPower, 'power')}
          hint={analysis.engine ? f(analysis.engine.curve.peakTorque.torque, 'torque') : ''}
        />
        <Stat
          label={t('stats.car.mass')}
          value={f(analysis.mass.total, 'mass')}
          hint={`${Math.round(analysis.mass.frontWeightShare * 100)} : ${Math.round((1 - analysis.mass.frontWeightShare) * 100)}`}
        />
        <Stat
          label={t('stats.car.accel')}
          value={f(p.accel0to100, 'time')}
          hint={units === 'imperial' ? '0–62 mph' : '0–100 km/h'}
        />
        <Stat label={t('stats.car.topSpeed')} value={f(p.topSpeed, 'speed')} />
        <Stat
          label={t('stats.car.braking')}
          value={f(p.braking100to0, 'distance')}
          hint={units === 'imperial' ? '62–0 mph' : '100–0 km/h'}
        />
        <Stat label={t('stats.car.lateral')} value={f(p.lateralAcceleration, 'acceleration')} />
        <Stat
          label={t('stats.car.consumption')}
          value={f(p.fuelPerDistance, 'consumption')}
          hint={f(p.co2PerDistance, 'co2')}
        />
        <Stat
          label={t('stats.car.cost')}
          value={f(analysis.cost.total, 'money')}
          hint={t('stats.car.running', { value: f(analysis.runningCost, 'money') })}
        />
        {engineer && (
          <Stat
            label={t('stats.car.powerToMass')}
            value={`${(pwUnit.toDisplay(powerToMass) / massUnit.toDisplay(1)).toFixed(3)} ${pwUnit.unit}/${massUnit.unit}`}
          />
        )}
        {engineer && (
          <Stat
            label={t('stats.car.drag')}
            value={`${analysis.aero.dragCoefficient.toFixed(3)} · ${analysis.aero.frontalArea.toFixed(2)} m²`}
          />
        )}
        {engineer && <Stat label={t('stats.car.quarterMile')} value={f(p.quarterMile, 'time')} />}
        {engineer && (
          <Stat
            label={t('stats.car.elasticity')}
            value={f(p.accel80to120, 'time')}
            hint={units === 'imperial' ? '50–75 mph' : '80–120 km/h'}
          />
        )}
        {engineer && <Stat label={t('stats.car.range')} value={f(p.range, 'longDistance')} />}
      </div>
      <Chart
        title={t('charts.traction')}
        x={traction.x}
        xUnit={traction.unit}
        yUnit="kN"
        height={220}
        formatX={(v) => Math.round(v).toString()}
        formatY={(v) => v.toFixed(1)}
        series={[
          ...traction.gears.map((values, i) => ({
            label: car.drivetrain.gearbox === 'cvt' ? 'CVT' : `${i + 1}.`,
            color: '--chart-2',
            values,
            width: 1.5,
          })),
          {
            label: t('charts.resistance'),
            color: '--muted',
            values: traction.resistance,
            dash: [6, 4],
          },
        ]}
      />
      <div className="output-columns">
        <section>
          <h3>{t('designer.ratings')}</h3>
          <RatingBars ratings={{ ...analysis.ratings }} ns="ratings.car" />
        </section>
        <section>
          <h3>{t('designer.warnings')}</h3>
          <WarningList warnings={analysis.warnings} onSelect={(w) => onWarning(w.path)} />
        </section>
      </div>
      {engineer && (
        <section>
          <h3>{t('designer.massBreakdown')}</h3>
          <table className="table">
            <tbody>
              {Object.entries(groups)
                .sort((a, b) => b[1] - a[1])
                .map(([g, m]) => (
                  <tr key={g}>
                    <td>{t(`massGroups.${g}`)}</td>
                    <td className="num">{f(m, 'mass')}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
