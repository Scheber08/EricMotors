import { useLocation } from 'wouter';
import { CAR_TEMPLATE_IDS, newCarFromTemplate, newEngineFromTemplate } from '../app/templates';
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
        {CAR_TEMPLATE_IDS.map((id) => (
          <button
            key={id}
            type="button"
            className="card doc-card btn"
            style={{ display: 'grid', textAlign: 'left' }}
            onClick={() => void createCar(id)}
          >
            <h3>{t(`templates.car.${id}`)}</h3>
          </button>
        ))}
      </div>
      <p className="muted" style={{ marginTop: 24 }}>
        {t('app.localOnly')}
      </p>
    </main>
  );
}
