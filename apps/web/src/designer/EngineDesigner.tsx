import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { CYLINDERS_BY_LAYOUT, Engine, type EngineVariant } from '@ericmotors/schema';
import { useLocale, useT } from '../i18n';
import { setPath } from '../lib/path';
import { useSettings } from '../state/settings';
import { useEngineDocument, useHistory } from '../state/document';
import { garage, newId } from '../storage/db';
import { formatQuantity, unitFor } from '../units/format';
import { useEngineAnalysis } from '../workers/usePhysics';
import { Chart } from './Chart';
import { DesignerShell, type SectionDef } from './DesignerShell';
import {
  type FieldContext,
  FieldGroup,
  NumberField,
  QualityField,
  SelectField,
  SliderField,
  ToggleField,
} from './fields';
import { defaultAspiration, normalizeEngine } from './normalize';
import { RatingBars, Stat, WarningList } from './Stats';
import { useAutosave } from './useAutosave';

const SECTIONS = ['block', 'bottomEnd', 'topEnd', 'aspiration', 'fuel', 'exhaust', 'tune'] as const;
type Section = (typeof SECTIONS)[number];

const rpm = (n: number) => (n * Math.PI) / 30;
const mm = (x: number) => x / 1000;

export function EngineDesigner({ id }: { id: string }) {
  const t = useT();
  const engine = useEngineDocument((s) => s.doc);
  const { load, update } = useEngineDocument.getState();
  const history = useHistory(useEngineDocument);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [section, setSection] = useState<Section>('block');
  const [variantIndex, setVariantIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void garage.loadEngine(id).then((e) => {
      if (cancelled) return;
      load(e);
      setVariantIndex(0);
      setStatus(e ? 'ready' : 'missing');
    });
    return () => {
      cancelled = true;
    };
  }, [id, load]);

  const valid = useMemo(() => (engine ? Engine.safeParse(engine).success : false), [engine]);
  const save = useCallback(async (e: Engine) => {
    if (Engine.safeParse(e).success) await garage.saveEngine(e);
  }, []);
  const saveState = useAutosave(engine, save);

  const vIndex = Math.min(variantIndex, (engine?.variants.length ?? 1) - 1);
  const variant = engine?.variants[vIndex];
  const analysis = useEngineAnalysis(engine?.family, variant);

  if (status === 'loading') return <main className="page muted">{t('common.loading')}</main>;
  if (!engine || !variant) {
    return (
      <main className="page">
        <p>{t('common.notFound')}</p>
        <Link href="/garage">{t('common.back')}</Link>
      </main>
    );
  }

  const flagged = new Set(
    (analysis.result?.warnings ?? []).map((w) =>
      w.path.replace(/^variant\./, `variants.${vIndex}.`).replace(/^family\./, 'family.'),
    ),
  );
  const ctx: FieldContext = {
    doc: engine,
    ns: 'params.engine',
    flagged,
    onChange: (path, value) =>
      update((draft) => {
        setPath(draft, path, value);
        normalizeEngine(draft, path);
      }),
  };
  const vp = (field: string) => `variants.${vIndex}.${field}`;

  const sections: SectionDef[] = SECTIONS.map((s) => ({ id: s, label: t(`sections.engine.${s}`) }));

  return (
    <DesignerShell
      title={engine.meta.name}
      onRename={(name) => update((d) => (d.meta.name = name))}
      sections={sections}
      active={section}
      onSelect={(s) => setSection(s as Section)}
      history={history}
      saveState={valid ? saveState : 'invalid'}
      toolbar={<VariantTabs engine={engine} index={vIndex} onIndex={setVariantIndex} />}
      center={<EngineOutput analysis={analysis} />}
      params={
        <>
          {section === 'block' && (
            <FieldGroup title={t('sections.engine.block')}>
              <SelectField ctx={ctx} path="family.layout" options={['inline', 'v', 'boxer']} />
              <SelectField
                ctx={ctx}
                path="family.cylinders"
                options={CYLINDERS_BY_LAYOUT[engine.family.layout]}
              />
              {engine.family.layout === 'v' && (
                <NumberField
                  ctx={ctx}
                  path="family.bankAngle"
                  quantity="angle"
                  min={Math.PI / 6}
                  max={Math.PI * 0.75}
                  step={Math.PI / 180}
                />
              )}
              <SelectField
                ctx={ctx}
                path="family.blockMaterial"
                options={['cast-iron', 'cgi', 'aluminium', 'aluminium-sleeved', 'magnesium']}
                optionKey="material"
              />
              <SelectField
                ctx={ctx}
                path="family.headMaterial"
                options={['cast-iron', 'aluminium']}
                optionKey="material"
              />
              <SelectField ctx={ctx} path="family.headType" options={['ohv', 'sohc', 'dohc']} />
              <SelectField
                ctx={ctx}
                path="family.valvesPerCylinder"
                options={
                  engine.family.headType === 'ohv'
                    ? [2]
                    : engine.family.headType === 'sohc'
                      ? [2, 3]
                      : [2, 3, 4, 5]
                }
              />
              <NumberField
                ctx={ctx}
                path="family.maxBore"
                quantity="smallLength"
                min={mm(50)}
                max={mm(140)}
                step={mm(0.5)}
              />
              <NumberField
                ctx={ctx}
                path="family.maxStroke"
                quantity="smallLength"
                min={mm(40)}
                max={mm(140)}
                step={mm(0.5)}
              />
              <QualityField ctx={ctx} path="family.quality" />
            </FieldGroup>
          )}
          {section === 'bottomEnd' && (
            <FieldGroup title={t('sections.engine.bottomEnd')}>
              <NumberField
                ctx={ctx}
                path={vp('bore')}
                quantity="smallLength"
                min={mm(50)}
                max={engine.family.maxBore}
                step={mm(0.1)}
              />
              <NumberField
                ctx={ctx}
                path={vp('stroke')}
                quantity="smallLength"
                min={mm(40)}
                max={engine.family.maxStroke}
                step={mm(0.1)}
              />
              <SelectField
                ctx={ctx}
                path={vp('crankshaft')}
                options={['cast-iron', 'forged-steel', 'billet-steel']}
              />
              <SelectField
                ctx={ctx}
                path={vp('conrods')}
                options={['cast', 'heavy-cast', 'forged', 'titanium']}
              />
              <SelectField
                ctx={ctx}
                path={vp('pistons')}
                options={['cast', 'hypereutectic', 'forged', 'low-friction']}
              />
              <QualityField ctx={ctx} path={vp('bottomEndQuality')} />
            </FieldGroup>
          )}
          {section === 'topEnd' && (
            <FieldGroup title={t('sections.engine.topEnd')}>
              <NumberField
                ctx={ctx}
                path={vp('compressionRatio')}
                quantity="ratio"
                min={6}
                max={24}
                step={0.1}
              />
              <SliderField ctx={ctx} path={vp('camProfile')} />
              <ToggleField ctx={ctx} path={vp('vvt')} />
              <ToggleField ctx={ctx} path={vp('vvl')} />
              <QualityField ctx={ctx} path={vp('topEndQuality')} />
            </FieldGroup>
          )}
          {section === 'aspiration' && (
            <AspirationFields
              ctx={ctx}
              variant={variant}
              vp={vp}
              onKind={(kind) =>
                update((d) => (d.variants[vIndex]!.aspiration = defaultAspiration(kind)))
              }
            />
          )}
          {section === 'fuel' && (
            <FieldGroup title={t('sections.engine.fuel')}>
              <SelectField
                ctx={ctx}
                path={vp('fuel')}
                options={['regular', 'premium', 'super', 'e85', 'diesel']}
              />
              <SelectField
                ctx={ctx}
                path={vp('fuelSystem')}
                options={[
                  'carburetor',
                  'single-point',
                  'multi-point',
                  'direct',
                  'diesel-indirect',
                  'common-rail',
                ]}
              />
              <SliderField ctx={ctx} path={vp('intakeSize')} />
              <QualityField ctx={ctx} path={vp('fuelQuality')} />
            </FieldGroup>
          )}
          {section === 'exhaust' && (
            <FieldGroup title={t('sections.engine.exhaust')}>
              <SelectField
                ctx={ctx}
                path={vp('headers')}
                options={['cast', 'short-tubular', 'long-tubular', 'equal-length']}
              />
              <NumberField
                ctx={ctx}
                path={vp('exhaustDiameter')}
                quantity="smallLength"
                min={mm(30)}
                max={mm(120)}
                step={mm(1)}
              />
              <SelectField
                ctx={ctx}
                path={vp('catalyst')}
                options={['none', 'two-way', 'three-way', 'high-flow']}
              />
              <SelectField
                ctx={ctx}
                path={vp('muffler')}
                options={['none', 'straight-through', 'baffled', 'reverse-flow']}
              />
              <QualityField ctx={ctx} path={vp('exhaustQuality')} />
            </FieldGroup>
          )}
          {section === 'tune' && (
            <FieldGroup title={t('sections.engine.tune')}>
              <NumberField
                ctx={ctx}
                path={vp('lambda')}
                quantity="ratio"
                min={variant.fuel === 'diesel' ? 1.05 : 0.75}
                max={variant.fuel === 'diesel' ? 2.5 : 1.1}
                step={0.01}
              />
              <SliderField ctx={ctx} path={vp('ignitionTiming')} />
              <NumberField
                ctx={ctx}
                path={vp('revLimit')}
                quantity="rotation"
                min={rpm(2_500)}
                max={rpm(12_000)}
                step={rpm(100)}
              />
            </FieldGroup>
          )}
        </>
      }
    />
  );
}

function AspirationFields({
  ctx,
  variant,
  vp,
  onKind,
}: {
  ctx: FieldContext;
  variant: EngineVariant;
  vp: (f: string) => string;
  onKind: (kind: EngineVariant['aspiration']['kind']) => void;
}) {
  const t = useT();
  const a = variant.aspiration;
  return (
    <FieldGroup title={t('sections.engine.aspiration')}>
      <div className="field">
        <div className="field-label">
          <label htmlFor="aspiration-kind">{t('params.engine.aspirationKind')}</label>
        </div>
        <select
          id="aspiration-kind"
          className="select"
          value={a.kind}
          onChange={(e) => onKind(e.target.value as EngineVariant['aspiration']['kind'])}
        >
          {(['natural', 'turbo', 'supercharger'] as const).map((k) => (
            <option key={k} value={k}>
              {t(`options.params.engine.aspirationKind.${k}`)}
            </option>
          ))}
        </select>
      </div>
      {a.kind === 'turbo' && (
        <>
          <SelectField
            ctx={ctx}
            path={vp('aspiration.count')}
            options={[1, 2]}
            label="turboCount"
          />
          <SliderField ctx={ctx} path={vp('aspiration.size')} label="turboSize" />
          <NumberField
            ctx={ctx}
            path={vp('aspiration.boost')}
            quantity="pressure"
            min={0.1e5}
            max={3e5}
            step={0.05e5}
            label="boost"
          />
          <SliderField ctx={ctx} path={vp('aspiration.intercooler')} label="intercooler" />
        </>
      )}
      {a.kind === 'supercharger' && (
        <>
          <SelectField
            ctx={ctx}
            path={vp('aspiration.type')}
            options={['roots', 'twin-screw', 'centrifugal']}
            label="superchargerType"
          />
          <SliderField ctx={ctx} path={vp('aspiration.size')} label="superchargerSize" />
          <NumberField
            ctx={ctx}
            path={vp('aspiration.boost')}
            quantity="pressure"
            min={0.1e5}
            max={2e5}
            step={0.05e5}
            label="boost"
          />
          <SliderField ctx={ctx} path={vp('aspiration.intercooler')} label="intercooler" />
        </>
      )}
      {a.kind !== 'natural' && <QualityField ctx={ctx} path={vp('aspirationQuality')} />}
    </FieldGroup>
  );
}

function VariantTabs({
  engine,
  index,
  onIndex,
}: {
  engine: Engine;
  index: number;
  onIndex: (i: number) => void;
}) {
  const t = useT();
  const { update } = useEngineDocument.getState();
  const add = () => {
    const base = engine.variants[index]!;
    update((d) =>
      d.variants.push({
        ...structuredClone(base),
        id: newId().slice(0, 8),
        name: t('designer.variantCopy', { name: base.name }),
      }),
    );
    onIndex(engine.variants.length);
  };
  const remove = () => {
    if (
      engine.variants.length < 2 ||
      !window.confirm(t('garage.confirmDelete', { name: engine.variants[index]!.name }))
    )
      return;
    update((d) => d.variants.splice(index, 1));
    onIndex(Math.max(0, index - 1));
  };
  const rename = () => {
    const name = window.prompt(t('common.name'), engine.variants[index]!.name);
    if (name?.trim()) update((d) => (d.variants[index]!.name = name.trim().slice(0, 60)));
  };
  return (
    <div className="variant-tabs" role="tablist" aria-label={t('designer.variants')}>
      {engine.variants.map((v, i) => (
        <button
          key={v.id}
          type="button"
          role="tab"
          aria-selected={i === index}
          className="tab"
          onClick={() => onIndex(i)}
          onDoubleClick={rename}
        >
          {v.name}
        </button>
      ))}
      <button
        type="button"
        className="btn small ghost"
        onClick={add}
        disabled={engine.variants.length >= 12}
        title={t('designer.addVariant')}
      >
        +
      </button>
      <button
        type="button"
        className="btn small ghost"
        onClick={rename}
        title={t('designer.renameVariant')}
      >
        ✎
      </button>
      {engine.variants.length > 1 && (
        <button
          type="button"
          className="btn small ghost danger"
          onClick={remove}
          title={t('garage.delete')}
        >
          ✕
        </button>
      )}
    </div>
  );
}

function EngineOutput({ analysis }: { analysis: ReturnType<typeof useEngineAnalysis> }) {
  const t = useT();
  const locale = useLocale();
  const units = useSettings((s) => s.units);
  const power = useSettings((s) => s.power);
  const engineer = useSettings((s) => s.mode === 'engineer');
  const a = analysis.result;
  const uc = { units, power };

  const charts = useMemo(() => {
    if (!a) return undefined;
    const rpmUnit = unitFor('rotation', uc);
    const torqueUnit = unitFor('torque', uc);
    const powerUnit = unitFor('power', uc);
    const pressureUnit = unitFor('pressure', uc);
    const x = a.curve.points.map((p) => rpmUnit.toDisplay(p.speed));
    return {
      x,
      torque: {
        unit: torqueUnit.unit,
        values: a.curve.points.map((p) => torqueUnit.toDisplay(p.torque)),
      },
      power: {
        unit: powerUnit.unit,
        values: a.curve.points.map((p) => powerUnit.toDisplay(p.power)),
      },
      boost: {
        unit: pressureUnit.unit,
        values: a.curve.points.map((p) => pressureUnit.toDisplay(p.boost)),
      },
      ve: a.curve.points.map((p) => p.volumetricEfficiency * 100),
      eff: a.curve.points.map((p) => p.efficiency * 100),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a, units, power]);

  if (!a || !charts)
    return <div className="output muted">{analysis.error ?? t('common.calculating')}</div>;
  const f = (
    v: number | null | undefined,
    q: Parameters<typeof formatQuantity>[1],
    digits?: number,
  ) => formatQuantity(v, q, uc, locale, digits);
  const rpmFmt = (v: number) => Math.round(v).toLocaleString(locale);

  return (
    <div className="output">
      <div className="stats">
        <Stat
          label={t('stats.engine.power')}
          value={f(a.curve.peakPower.power, 'power')}
          hint={`@ ${f(a.curve.peakPower.speed, 'rotation')}`}
        />
        <Stat
          label={t('stats.engine.torque')}
          value={f(a.curve.peakTorque.torque, 'torque')}
          hint={`@ ${f(a.curve.peakTorque.speed, 'rotation')}`}
        />
        <Stat label={t('stats.engine.displacement')} value={f(a.displacement, 'displacement')} />
        <Stat label={t('stats.engine.mass')} value={f(a.mass, 'mass')} />
        <Stat label={t('stats.engine.cost')} value={f(a.cost, 'money')} />
        {engineer && (
          <Stat
            label={t('stats.engine.specific')}
            value={`${((a.specificPower / 1000) * 1e-3).toFixed(1)} kW/l`}
          />
        )}
        {engineer && (
          <Stat label={t('stats.engine.bsfc')} value={`${Math.round(a.bestBsfc * 3.6e9)} g/kWh`} />
        )}
        {engineer && (
          <Stat
            label={t('stats.engine.dimensions')}
            value={`${[a.dimensions.length, a.dimensions.width, a.dimensions.height].map((d) => f(d, 'smallLength', 0)).join(' × ')}`}
          />
        )}
      </div>
      <div className="charts">
        <Chart
          title={t('charts.torque')}
          x={charts.x}
          xUnit="1/min"
          yUnit={charts.torque.unit}
          formatX={rpmFmt}
          series={[{ label: t('charts.torque'), color: '--chart-2', values: charts.torque.values }]}
        />
        <Chart
          title={t('charts.power')}
          x={charts.x}
          xUnit="1/min"
          yUnit={charts.power.unit}
          formatX={rpmFmt}
          series={[{ label: t('charts.power'), color: '--chart-1', values: charts.power.values }]}
        />
        {a.curve.peakBoost > 0 && (
          <Chart
            title={t('charts.boost')}
            x={charts.x}
            xUnit="1/min"
            yUnit={charts.boost.unit}
            height={130}
            formatX={rpmFmt}
            formatY={(v) => v.toFixed(2)}
            series={[{ label: t('charts.boost'), color: '--chart-2', values: charts.boost.values }]}
          />
        )}
        {engineer && (
          <Chart
            title={t('charts.efficiency')}
            x={charts.x}
            xUnit="1/min"
            yUnit="%"
            height={150}
            formatX={rpmFmt}
            series={[
              { label: t('charts.ve'), color: '--chart-2', values: charts.ve },
              { label: t('charts.eta'), color: '--chart-1', values: charts.eff },
            ]}
          />
        )}
      </div>
      <div className="output-columns">
        <section>
          <h3>{t('designer.ratings')}</h3>
          <RatingBars ratings={{ ...a.ratings }} ns="ratings.engine" />
        </section>
        <section>
          <h3>{t('designer.warnings')}</h3>
          <WarningList warnings={a.warnings} />
        </section>
      </div>
      {engineer && analysis.ms !== undefined && (
        <p className="muted small">{t('designer.computeTime', { ms: analysis.ms.toFixed(1) })}</p>
      )}
    </div>
  );
}
