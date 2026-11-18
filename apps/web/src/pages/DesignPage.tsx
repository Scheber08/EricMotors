import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import {
  type Car,
  type DesignMeta,
  type Engine,
  ReportReason,
  migrateCar,
  migrateEngine,
} from '@ericmotors/schema';
import { api } from '../api/client';
import { AuthDialog } from '../community/AuthDialog';
import { apiErrorMessage } from '../community/errors';
import { CarOutput } from '../designer/CarDesigner';
import { EngineOutput } from '../designer/EngineDesigner';
import { useLocale, useT } from '../i18n';
import { useAuth } from '../state/auth';
import { garage, newId } from '../storage/db';
import { useCarAnalysis, useEngineAnalysis } from '../workers/usePhysics';

const CarViewer = lazy(() =>
  import('../designer/car/CarViewer').then((m) => ({ default: m.CarViewer })),
);

type Loaded = { meta: DesignMeta } & (
  { kind: 'car'; car: Car } | { kind: 'engine'; engine: Engine }
);

/** Öffentliche Ansicht eines Cloud-Entwurfs (Teilen-Link `/v/:id`). */
export function DesignPage({ id }: { id: string }) {
  const t = useT();
  const locale = useLocale();
  const [, navigate] = useLocation();
  const user = useAuth((s) => s.user);
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [login, setLogin] = useState(false);
  const [reporting, setReporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { design } = await api.design(id);
      const raw = await api.designData<unknown>(id, design.version);
      const loaded: Loaded =
        design.kind === 'car'
          ? { meta: design, kind: 'car', car: migrateCar(raw) }
          : { meta: design, kind: 'engine', engine: migrateEngine(raw) };
      if (!cancelled) setData(loaded);
    })().catch((err: unknown) => !cancelled && setError(apiErrorMessage(err)));
    return () => {
      cancelled = true;
    };
    // Bei An-/Abmeldung neu laden (likedByMe, private Sichtbarkeit).
  }, [id, user?.id]);

  if (error) {
    return (
      <main className="page">
        <p className="form-error">{error}</p>
        <Link href="/gallery">{t('gallery.title')}</Link>
      </main>
    );
  }
  if (!data) return <main className="page muted">{t('common.loading')}</main>;
  const { meta } = data;
  const own = user?.username.toLowerCase() === meta.owner.toLowerCase();
  const url = `${window.location.origin}/v/${meta.id}`;

  const requireLogin = () => {
    if (user) return true;
    setLogin(true);
    return false;
  };
  const toggleLike = async () => {
    if (!requireLogin()) return;
    try {
      const r = meta.likedByMe ? await api.unlike(meta.id) : await api.like(meta.id);
      setData({ ...data, meta: { ...meta, likes: r.likes, likedByMe: r.likedByMe } });
    } catch (err) {
      setNotice(apiErrorMessage(err));
    }
  };
  const shareLink = async () => {
    try {
      if (navigator.share) await navigator.share({ title: meta.title, url });
      else {
        await navigator.clipboard.writeText(url);
        setNotice(t('cloud.copied'));
      }
    } catch {
      // Teilen abgebrochen
    }
  };
  const fork = async () => {
    const forkOf = { id: meta.id, ownerName: meta.owner, title: meta.title };
    const name = t('detail.copyName', { name: meta.title }).slice(0, 80);
    if (data.kind === 'car') {
      const car: Car = {
        ...structuredClone(data.car),
        id: newId(),
        meta: { ...data.car.meta, name, forkOf },
      };
      await garage.saveCar(car);
      navigate(`/car/${car.id}`);
    } else {
      const engine: Engine = {
        ...structuredClone(data.engine),
        id: newId(),
        meta: { ...data.engine.meta, name, forkOf },
      };
      await garage.saveEngine(engine);
      navigate(`/engine/${engine.id}`);
    }
  };
  const edit = async () => {
    // Eigene Entwürfe: lokale Kopie öffnen oder aus der Cloud in die Garage laden.
    if (data.kind === 'car') {
      if (!(await garage.loadCar(meta.id))) await garage.saveCar(data.car);
      navigate(`/car/${meta.id}`);
    } else {
      if (!(await garage.loadEngine(meta.id))) await garage.saveEngine(data.engine);
      navigate(`/engine/${meta.id}`);
    }
  };
  const report = async (reason: ReportReason) => {
    setReporting(false);
    if (!requireLogin()) return;
    try {
      await api.report(meta.id, reason);
      setNotice(t('detail.reported'));
    } catch (err) {
      setNotice(apiErrorMessage(err));
    }
  };
  const forkSource = data.kind === 'car' ? data.car.meta.forkOf : data.engine.meta.forkOf;

  return (
    <main className="design-page">
      <header className="design-header">
        <div>
          <h1>{meta.title}</h1>
          <p className="muted">
            <Link href={`/u/${meta.owner}`}>{t('gallery.by', { name: meta.owner })}</Link> ·{' '}
            {t('detail.updated', {
              date: new Date(meta.updatedAt).toLocaleDateString(locale, { dateStyle: 'medium' }),
            })}
          </p>
          {forkSource && (
            <p className="muted small">
              <Link href={`/v/${forkSource.id}`}>
                {t('detail.forkOf', { title: forkSource.title, owner: forkSource.ownerName })}
              </Link>
            </p>
          )}
          {meta.description && <p>{meta.description}</p>}
        </div>
        <div className="design-actions">
          <button
            type="button"
            className={`btn${meta.likedByMe ? ' primary' : ''}`}
            aria-pressed={!!meta.likedByMe}
            onClick={() => void toggleLike()}
          >
            ♥ {meta.likes}
          </button>
          <button type="button" className="btn" onClick={() => void shareLink()}>
            {t('detail.share')}
          </button>
          <button type="button" className="btn primary" onClick={() => void fork()}>
            {t('detail.fork')}
          </button>
          {own ? (
            <button type="button" className="btn" onClick={() => void edit()}>
              {t('detail.edit')}
            </button>
          ) : (
            <div className="settings-menu">
              <button
                type="button"
                className="btn ghost danger"
                aria-expanded={reporting}
                onClick={() => setReporting(!reporting)}
              >
                {t('detail.report')}
              </button>
              {reporting && (
                <div className="settings-panel card menu">
                  <span className="muted small">{t('detail.reportReason')}</span>
                  {ReportReason.options.map((r) => (
                    <button
                      key={r}
                      type="button"
                      className="btn ghost"
                      onClick={() => void report(r)}
                    >
                      {t(`detail.reasons.${r}`)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
      </header>
      {data.kind === 'car' ? <CarDetail car={data.car} /> : <EngineDetail engine={data.engine} />}
      {login && <AuthDialog initialMode="login" onClose={() => setLogin(false)} />}
    </main>
  );
}

function CarDetail({ car }: { car: Car }) {
  const analysis = useCarAnalysis(car);
  return (
    <div className="car-center">
      <div className="viewer">
        <Suspense fallback={null}>
          <CarViewer
            car={car}
            analysis={analysis.result}
            mode="normal"
            onSelect={() => undefined}
          />
        </Suspense>
      </div>
      <CarOutput
        car={car}
        analysis={analysis.result}
        error={analysis.error}
        onWarning={() => undefined}
      />
    </div>
  );
}

function EngineDetail({ engine }: { engine: Engine }) {
  const [index, setIndex] = useState(0);
  const analysis = useEngineAnalysis(engine.family, engine.variants[index]);
  return (
    <div>
      {engine.variants.length > 1 && (
        <div className="variant-tabs" style={{ padding: '0 16px' }}>
          {engine.variants.map((v, i) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              className="tab"
              aria-selected={i === index}
              onClick={() => setIndex(i)}
            >
              {v.name}
            </button>
          ))}
        </div>
      )}
      <EngineOutput analysis={analysis} />
    </div>
  );
}
