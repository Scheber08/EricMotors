import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import type { CarAnalysis } from '@ericmotors/physics';
import {
  type Car,
  type CarEngine,
  ENGINE_TEMPLATES,
  type Engine,
  type EngineTemplateId,
  type MotorPosition,
  carEngineFrom,
} from '@ericmotors/schema';
import { ENGINE_TEMPLATE_IDS } from '../../app/templates';
import { useLocale, useT } from '../../i18n';
import { useCarDocument } from '../../state/document';
import { type DocSummary, garage, newId } from '../../storage/db';
import { addMotor, freeMotorPositions, removeMotor, setPowertrainType } from '../carNormalize';
import {
  CardField,
  type FieldContext,
  FieldGroup,
  NumberField,
  QualityField,
  ToggleField,
} from '../fields';
import { OPTION_ICONS } from '../icons';
import { PowertrainDiagram } from './PowertrainDiagram';

const KWH = 3.6e6;
const rpm = (n: number) => (n * Math.PI) / 30;

/** Kennwerte der Zellchemien für die Kartenbeschriftung (Wh/kg auf Packebene). */
const CHEMISTRY_WH_KG = { lfp: 140, nmc: 175, nca: 190, 'solid-state': 250 } as const;

/**
 * Antrieb: Antriebsart als Bildkarten, Schema in Draufsicht, darunter Verbrenner, E-Motoren und
 * Batterie. E-Motoren und Batterie werden direkt im Auto eingestellt.
 */
export function PowertrainSection({
  car,
  ctx,
  analysis,
}: {
  car: Car;
  ctx: FieldContext;
  analysis: CarAnalysis | undefined;
}) {
  const t = useT();
  const { update } = useCarDocument.getState();
  const pt = car.powertrain;
  const free = freeMotorPositions(car);
  const scrollTo = (id: string) =>
    document.getElementById(`pt-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <>
      <FieldGroup title={t('sections.car.powertrain')}>
        <PowertrainDiagram car={car} analysis={analysis} onSelect={scrollTo} />
        <CardField
          ctx={ctx}
          path="powertrain.type"
          label="powertrainType"
          options={['ice', 'electric', 'hybrid']}
          onPick={(o) => update((d) => setPowertrainType(d, o as Car['powertrain']['type']))}
        />
        {pt.type === 'hybrid' && <ToggleField ctx={ctx} path="powertrain.hybrid.plugIn" />}
      </FieldGroup>
      {pt.engine && (
        <div id="pt-engine">
          <EngineSection car={car} engine={pt.engine} ctx={ctx} />
        </div>
      )}
      {pt.motors.map((m, i) => (
        <div key={m.id} id={`pt-motor-${m.position}`}>
          <MotorFields
            car={car}
            index={i}
            ctx={ctx}
            onRemove={() => update((d) => removeMotor(d, i))}
          />
        </div>
      ))}
      {free.length > 0 && pt.motors.length < 3 && (
        <div className="add-motor">
          {free.map((p) => (
            <button
              key={p}
              type="button"
              className="btn small"
              onClick={() => update((d) => addMotor(d, p))}
            >
              <span className="option-icon">{OPTION_ICONS.motorPosition![p]}</span>
              {t('designer.addMotor', { position: t(`options.params.car.motorPosition.${p}`) })}
            </button>
          ))}
        </div>
      )}
      {pt.battery && (
        <div id="pt-battery">
          <BatteryFields car={car} ctx={ctx} />
        </div>
      )}
    </>
  );
}

function MotorFields({
  car,
  index,
  ctx,
  onRemove,
}: {
  car: Car;
  index: number;
  ctx: FieldContext;
  onRemove: () => void;
}) {
  const t = useT();
  const m = car.powertrain.motors[index]!;
  const p = (k: string) => `powertrain.motors.${index}.${k}`;
  const positions: MotorPosition[] =
    car.powertrain.type === 'hybrid' ? ['gearbox', 'front', 'rear'] : ['front', 'rear'];
  return (
    <FieldGroup
      title={t('designer.motorTitle', {
        position: t(`options.params.car.motorPosition.${m.position}`),
      })}
    >
      <CardField ctx={ctx} path={p('position')} label="motorPosition" options={positions} />
      {m.position !== 'gearbox' && (
        <CardField
          ctx={ctx}
          path={p('count')}
          label="motorCount"
          options={[1, 2]}
          optionKey="params.car.motorCount"
        />
      )}
      <CardField
        ctx={ctx}
        path={p('type')}
        label="motorType"
        options={['pmsm', 'induction', 'axial-flux']}
      />
      <NumberField
        ctx={ctx}
        path={p('peakPower')}
        label="peakPower"
        quantity="power"
        min={5e3}
        max={m.position === 'gearbox' ? 250e3 : 800e3}
        step={1e3}
      />
      <NumberField
        ctx={ctx}
        path={p('maxSpeed')}
        label="motorMaxSpeed"
        quantity="rotation"
        min={rpm(5_000)}
        max={rpm(30_000)}
        step={rpm(100)}
      />
      {m.position !== 'gearbox' && (
        <NumberField
          ctx={ctx}
          path={p('reduction')}
          label="reduction"
          quantity="ratio"
          min={3}
          max={15}
          step={0.01}
        />
      )}
      <CardField
        ctx={ctx}
        path={p('cooling')}
        label="motorCooling"
        options={['air', 'liquid', 'oil-spray']}
        iconSet="cooling"
      />
      <QualityField ctx={ctx} path={p('quality')} />
      {car.powertrain.motors.length > 1 && (
        <button type="button" className="btn small danger" onClick={onRemove}>
          {t('designer.removeMotor')}
        </button>
      )}
    </FieldGroup>
  );
}

function BatteryFields({ car, ctx }: { car: Car; ctx: FieldContext }) {
  const t = useT();
  const big = car.powertrain.type === 'electric' || car.powertrain.hybrid?.plugIn;
  return (
    <FieldGroup title={t('designer.battery')}>
      <CardField
        ctx={ctx}
        path="powertrain.battery.chemistry"
        options={['lfp', 'nmc', 'nca', 'solid-state']}
        badge={(o) => `${CHEMISTRY_WH_KG[o as keyof typeof CHEMISTRY_WH_KG]} Wh/kg`}
      />
      <CardField
        ctx={ctx}
        path="powertrain.battery.cells"
        options={['energy', 'balanced', 'power']}
      />
      <NumberField
        ctx={ctx}
        path="powertrain.battery.capacity"
        quantity="energy"
        min={big ? 5 * KWH : 0.5 * KWH}
        max={big ? 200 * KWH : 5 * KWH}
        step={0.1 * KWH}
      />
      <CardField ctx={ctx} path="powertrain.battery.voltage" options={['400V', '800V']} />
      <CardField
        ctx={ctx}
        path="powertrain.battery.cooling"
        label="batteryCooling"
        options={['passive', 'air', 'liquid']}
        iconSet="cooling"
      />
      <QualityField ctx={ctx} path="powertrain.battery.quality" />
    </FieldGroup>
  );
}

/** Motorwahl: aus der eigenen Motor-Bibliothek oder einer Vorlage, plus Einbaulage. */
export function EngineSection({
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
      <CardField
        ctx={ctx}
        path="powertrain.engine.placement"
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
