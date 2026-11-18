import { useEffect, useState } from 'react';
import type { DesignMeta } from '@ericmotors/schema';
import { api } from '../api/client';
import { DesignCard } from '../community/DesignCard';
import { apiErrorMessage } from '../community/errors';
import { useT } from '../i18n';

export function ProfilePage({ username }: { username: string }) {
  const t = useT();
  const [items, setItems] = useState<DesignMeta[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    api
      .userDesigns(username)
      .then((r) => !cancelled && setItems(r.items))
      .catch((err: unknown) => !cancelled && setError(apiErrorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [username]);
  return (
    <main className="page">
      <h1>{t('profile.title', { name: username })}</h1>
      {error && <p className="form-error">{error}</p>}
      {items?.length === 0 && <p className="muted">{t('profile.empty')}</p>}
      <div className="grid gallery-grid">
        {items?.map((d) => (
          <DesignCard key={d.id} design={d} showOwner={false} />
        ))}
      </div>
    </main>
  );
}
