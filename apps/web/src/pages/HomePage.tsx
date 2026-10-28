import { useMemo } from 'react';
import { useLocation } from 'wouter';
import { CAR_TEMPLATES } from '@ericmotors/schema';
import { CAR_TEMPLATE_IDS, newCarFromTemplate, newEngineFromTemplate } from '../app/templates';
import { CarSilhouette } from '../designer/car/CarSilhouette';
import { OPTION_ICONS } from '../designer/icons';
import { BRAND } from '../brand';
import { useT } from '../i18n';
import { garage } from '../storage/db';
import type { CarTemplateId } from '@ericmotors/schema';

export function HomePage() {
  const t = useT();
  const [, navigate] = useLocation();

  const createCar = async (id: CarTemplateId | 'base') => {
    const car = newCarFromTemplate(
      id,
      id === 'base' ? t('garage.newCar') : t(`templates.car.${id}`),
    );
    await garage.saveCar(car);
    navigate(`/car/${car.id}`);
  };
  const templates = useMemo(
    () => CAR_TEMPLATE_IDS.map((id) => ({ id, car: CAR_TEMPLATES[id]() })),
    [],
  );
  const createEngine = async () => {
    const engine = newEngineFromTemplate('i4-16-na', t('garage.newEngine'));
    await garage.saveEngine(engine);
    navigate(`/engine/${engine.id}`);
  };

  return (
    <main className="page">
      <section className="hero">
        <h1>
          {BRAND.prefix}
          <span>{BRAND.suffix}</span>
        </h1>
        <p>{t('app.tagline')}</p>
        <div className="actions">
          <button type="button" className="btn primary" onClick={() => void createCar('hot-hatch')}>
            {t('home.ctaCar')}
          </button>
          <button type="button" className="btn" onClick={() => void createEngine()}>
            {t('home.ctaEngine')}
          </button>
        </div>
      </section>

      <div className="grid">
        {(['engine', 'car', 'stats'] as const).map((k) => (
          <div key={k} className="card feature">
            <h3>{t(`home.features.${k}.title`)}</h3>
            <p>{t(`home.features.${k}.text`)}</p>
          </div>
        ))}
      </div>

      <div className="section-title">
        <h2>{t('home.templates')}</h2>
        <span className="muted">{t('home.templatesHint')}</span>
      </div>
      <div className="grid">
        {templates.map(({ id, car }) => (
          <button
            key={id}
            type="button"
            className="card template-card"
            onClick={() => void createCar(id)}
          >
            <span className="template-stage">
              <span className={`powertrain-badge ${car.powertrain.type}`}>
                {OPTION_ICONS.powertrainType![car.powertrain.type]}
                {t(`options.params.car.powertrainType.${car.powertrain.type}`)}
              </span>
              <CarSilhouette car={car} />
            </span>
            <span className="template-body">
              <strong>{t(`templates.car.${id}`)}</strong>
              <span className="muted small">
                {t(`options.params.car.shape.${car.model.shape}`)}
              </span>
            </span>
          </button>
        ))}
      </div>
      <p className="muted" style={{ marginTop: 24 }}>
        {t('app.localOnly')}
      </p>
    </main>
  );
}
