import { useEffect, useState } from 'react';
import type { DesignKind, DesignMeta } from '@ericmotors/schema';
import { BodyShape } from '@ericmotors/schema';
import { api } from '../api/client';
import { DesignCard } from '../community/DesignCard';
import { apiErrorMessage } from '../community/errors';
import { OPTION_ICONS } from '../designer/icons';
import { useT } from '../i18n';

interface Filters {
  kind: DesignKind;
  sort: 'recent' | 'likes';
  category: string;
  layout: string;
  powertrain: '' | 'ice' | 'electric' | 'hybrid';
  minPowerW: string;
}

const KW = 1000;

export function GalleryPage() {
  const t = useT();
  const [filters, setFilters] = useState<Filters>({
    kind: 'car',
    sort: 'recent',
    category: '',
    layout: '',
    powertrain: '',
    minPowerW: '',
  });
  const [items, setItems] = useState<DesignMeta[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');

  const fetchPage = (from: string | null) =>
    api.gallery({
      ...filters,
      minPowerW: filters.minPowerW ? Number(filters.minPowerW) * KW : undefined,
      cursor: from ?? undefined,
    });

  // Erste Seite bei jedem Filterwechsel; der Ladezustand wird im Event-Handler gesetzt.
  useEffect(() => {
    let cancelled = false;
    fetchPage(null)
      .then((page) => {
        if (cancelled) return;
        setItems(page.items);
        setCursor(page.nextCursor);
        setState('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(apiErrorMessage(err));
        setState('error');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const loadMore = async () => {
    setState('loading');
    try {
      const page = await fetchPage(cursor);
      setItems((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
      setState('ready');
    } catch (err) {
      setError(apiErrorMessage(err));
      setState('error');
    }
  };

  const set = (patch: Partial<Filters>) => {
    setState('loading');
    setFilters((f) => ({
      ...f,
      ...patch,
      ...(patch.kind ? { category: '', layout: '', powertrain: '' } : {}),
    }));
  };
  const categories =
    filters.kind === 'car' ? BodyShape.options : (['inline', 'v', 'boxer'] as const);
  const layouts =
    filters.kind === 'car'
      ? (['fwd', 'rwd', 'awd'] as const)
      : (['regular', 'premium', 'super', 'e85', 'diesel'] as const);

  return (
    <main className="page">
      <h1>{t('gallery.title')}</h1>
      <div className="filter-row">
        <div className="segmented" role="group">
          {(['car', 'engine'] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={filters.kind === k}
              onClick={() => set({ kind: k })}
            >
              {t(k === 'car' ? 'gallery.cars' : 'gallery.engines')}
            </button>
          ))}
        </div>
        {filters.kind === 'car' && (
          <div
            className="segmented icon-segmented"
            role="group"
            aria-label={t('params.car.powertrainType')}
          >
            {(['', 'ice', 'electric', 'hybrid'] as const).map((p) => (
              <button
                key={p || 'all'}
                type="button"
                aria-pressed={filters.powertrain === p}
                onClick={() => set({ powertrain: p })}
              >
                {p && OPTION_ICONS.powertrainType![p]}
                {p ? t(`options.params.car.powertrainType.${p}`) : t('gallery.all')}
              </button>
            ))}
          </div>
        )}
        <select
          className="select"
          aria-label={t('gallery.sort')}
          value={filters.sort}
          onChange={(e) => set({ sort: e.target.value as Filters['sort'] })}
        >
          <option value="recent">{t('gallery.recent')}</option>
          <option value="likes">{t('gallery.likes')}</option>
        </select>
        <select
          className="select"
          aria-label={t(filters.kind === 'car' ? 'params.car.shape' : 'params.engine.layout')}
          value={filters.category}
          onChange={(e) => set({ category: e.target.value })}
        >
          <option value="">
            {t(filters.kind === 'car' ? 'params.car.shape' : 'params.engine.layout')}:{' '}
            {t('gallery.all')}
          </option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {t(
                filters.kind === 'car'
                  ? `options.params.car.shape.${c}`
                  : `options.params.engine.layout.${c}`,
              )}
            </option>
          ))}
        </select>
        <select
          className="select"
          aria-label={t(filters.kind === 'car' ? 'params.car.layout' : 'params.engine.fuel')}
          value={filters.layout}
          onChange={(e) => set({ layout: e.target.value })}
        >
          <option value="">
            {t(filters.kind === 'car' ? 'params.car.layout' : 'params.engine.fuel')}:{' '}
            {t('gallery.all')}
          </option>
          {layouts.map((l) => (
            <option key={l} value={l}>
              {t(
                filters.kind === 'car'
                  ? `options.params.car.layout.${l}`
                  : `options.params.engine.fuel.${l}`,
              )}
            </option>
          ))}
        </select>
        <label className="inline-field">
          {t('gallery.minPower')}
          <input
            className="input"
            inputMode="numeric"
            style={{ width: 80 }}
            value={filters.minPowerW}
            onChange={(e) => set({ minPowerW: e.target.value.replace(/\D/g, '') })}
          />
          kW
        </label>
      </div>
      {state === 'error' && <p className="form-error">{error}</p>}
      {state !== 'error' && items.length === 0 && state === 'ready' && (
        <p className="muted">{t('gallery.empty')}</p>
      )}
      <div className={`grid gallery-grid${state === 'loading' ? ' refreshing' : ''}`}>
        {items.map((d) => (
          <DesignCard key={d.id} design={d} />
        ))}
      </div>
      {cursor && (
        <button
          type="button"
          className="btn"
          style={{ marginTop: 16 }}
          disabled={state === 'loading'}
          onClick={() => void loadMore()}
        >
          {t('gallery.more')}
        </button>
      )}
    </main>
  );
}
