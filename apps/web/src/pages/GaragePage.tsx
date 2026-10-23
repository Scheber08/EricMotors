import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import type { CarTemplateId, EngineTemplateId } from '@ericmotors/schema';
import {
  CAR_TEMPLATE_IDS,
  ENGINE_TEMPLATE_IDS,
  newCarFromTemplate,
  newEngineFromTemplate,
} from '../app/templates';
import { useLocale, useT } from '../i18n';
import { CloudList } from '../community/CloudList';
import { type DocSummary, garage, newId } from '../storage/db';

function DocList({
  kind,
  items,
  onChange,
}: {
  kind: 'car' | 'engine';
  items: DocSummary[];
  onChange: () => void;
}) {
  const t = useT();
  const locale = useLocale();
  if (items.length === 0) return <p className="muted">{t('garage.empty')}</p>;

  const duplicate = async (id: string) => {
    if (kind === 'car') {
      const car = await garage.loadCar(id);
      if (car)
        await garage.saveCar({
          ...car,
          id: newId(),
          meta: { ...car.meta, name: t('garage.copyOf', { name: car.meta.name }) },
        });
    } else {
      const engine = await garage.loadEngine(id);
      if (engine)
        await garage.saveEngine({
          ...engine,
          id: newId(),
          meta: { ...engine.meta, name: t('garage.copyOf', { name: engine.meta.name }) },
        });
    }
    onChange();
  };
  const remove = async (item: DocSummary) => {
    if (!window.confirm(t('garage.confirmDelete', { name: item.name }))) return;
    await (kind === 'car' ? garage.removeCar(item.id) : garage.removeEngine(item.id));
    onChange();
  };

  return (
    <div className="grid">
      {items.map((item) => (
        <div key={item.id} className="card doc-card">
          <h3>{item.name}</h3>
          <span className="muted">
            {t('garage.updated', {
              date: new Date(item.updatedAt).toLocaleString(locale, {
                dateStyle: 'medium',
                timeStyle: 'short',
              }),
            })}
          </span>
          <div className="row">
            <Link className="btn small primary" href={`/${kind}/${item.id}`}>
              {t('garage.open')}
            </Link>
            <button type="button" className="btn small" onClick={() => void duplicate(item.id)}>
              {t('garage.duplicate')}
            </button>
            <button type="button" className="btn small danger" onClick={() => void remove(item)}>
              {t('garage.delete')}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function GaragePage() {
  const t = useT();
  const [, navigate] = useLocation();
  const [cars, setCars] = useState<DocSummary[]>([]);
  const [engines, setEngines] = useState<DocSummary[]>([]);

  const refresh = useCallback(() => {
    void garage.listCars().then(setCars);
    void garage.listEngines().then(setEngines);
  }, []);
  useEffect(refresh, [refresh]);

  const createCar = async (id: CarTemplateId | 'base') => {
    const car = newCarFromTemplate(
      id,
      id === 'base' ? t('garage.newCar') : t(`templates.car.${id}`),
    );
    await garage.saveCar(car);
    navigate(`/car/${car.id}`);
  };
  const createEngine = async (id: EngineTemplateId) => {
    const engine = newEngineFromTemplate(id, t(`templates.engine.${id}`));
    await garage.saveEngine(engine);
    navigate(`/engine/${engine.id}`);
  };

  return (
    <main className="page">
      <h1>{t('garage.title')}</h1>

      <div className="section-title">
        <h2>{t('garage.cars')}</h2>
        <div className="row" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn small primary"
            onClick={() => void createCar('base')}
          >
            + {t('garage.newCar')}
          </button>
          <select
            className="select"
            value=""
            aria-label={t('garage.fromTemplate')}
            onChange={(e) => e.target.value && void createCar(e.target.value as CarTemplateId)}
          >
            <option value="">{t('garage.fromTemplate')} …</option>
            {CAR_TEMPLATE_IDS.map((id) => (
              <option key={id} value={id}>
                {t(`templates.car.${id}`)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <DocList kind="car" items={cars} onChange={refresh} />

      <div className="section-title">
        <h2>{t('garage.engines')}</h2>
        <select
          className="select"
          value=""
          aria-label={t('garage.newEngine')}
          onChange={(e) => e.target.value && void createEngine(e.target.value as EngineTemplateId)}
        >
          <option value="">+ {t('garage.newEngine')} …</option>
          {ENGINE_TEMPLATE_IDS.map((id) => (
            <option key={id} value={id}>
              {t(`templates.engine.${id}`)}
            </option>
          ))}
        </select>
      </div>
      <DocList kind="engine" items={engines} onChange={refresh} />

      <CloudList onImported={refresh} />
    </main>
  );
}
