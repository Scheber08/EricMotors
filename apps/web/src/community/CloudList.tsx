import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { type DesignMeta, migrateCar, migrateEngine } from '@ericmotors/schema';
import { api } from '../api/client';
import { useT } from '../i18n';
import { useAuth } from '../state/auth';
import { garage } from '../storage/db';
import { DesignCard } from './DesignCard';
import { apiErrorMessage } from './errors';

/** Eigene Cloud-Entwürfe in der Garage; „In die Garage laden“ holt sie auf dieses Gerät. */
export function CloudList({ onImported }: { onImported: () => void }) {
  const t = useT();
  const user = useAuth((s) => s.user);
  const [items, setItems] = useState<DesignMeta[] | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    api
      .myDesigns()
      .then((r) => !cancelled && setItems(r.items))
      .catch((err: unknown) => !cancelled && setMessage({ ok: false, text: apiErrorMessage(err) }));
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user) return null;
  const download = async (d: DesignMeta) => {
    try {
      const raw = await api.designData<unknown>(d.id, d.version);
      if (d.kind === 'car') await garage.saveCar(migrateCar(raw));
      else await garage.saveEngine(migrateEngine(raw));
      setMessage({ ok: true, text: t('cloud.downloaded') });
      onImported();
    } catch (err) {
      setMessage({ ok: false, text: apiErrorMessage(err) });
    }
  };

  return (
    <section>
      <div className="section-title">
        <h2>☁ {t('cloud.myCloud')}</h2>
        <span className="muted small">
          {t('cloud.quota', { count: items?.length ?? user.designCount, limit: 50 })}
        </span>
      </div>
      {message && <p className={message.ok ? 'ok-note' : 'form-error'}>{message.text}</p>}
      {items?.length === 0 && <p className="muted">{t('cloud.notSaved')}</p>}
      <div className="grid gallery-grid">
        {items?.map((d) => (
          <div key={d.id} className="cloud-item">
            <DesignCard design={d} showOwner={false} />
            <div className="row-buttons">
              <span className="muted small">{t(`visibility.${d.visibility}`)}</span>
              <button type="button" className="btn small" onClick={() => void download(d)}>
                {t('cloud.download')}
              </button>
              <Link className="btn small ghost" href={`/${d.kind}/${d.id}`}>
                {t('garage.open')}
              </Link>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
