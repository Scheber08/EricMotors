import { useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import type { DesignKind, DesignMeta, DesignStats, Visibility } from '@ericmotors/schema';
import { ApiError, api } from '../api/client';
import { AuthDialog } from '../community/AuthDialog';
import { apiErrorMessage } from '../community/errors';
import { useT } from '../i18n';
import { useAuth } from '../state/auth';

interface Props {
  kind: DesignKind;
  doc: { id: string; meta: { name: string } };
  stats: DesignStats | undefined;
  /** Gibt es Fehler-Warnungen bzw. ist das Dokument ungültig, wird nicht hochgeladen. */
  blocked: boolean;
  thumbnail: () => Promise<Blob | null>;
}

/** Cloud-Speichern mit Sichtbarkeit, Teilen-Link und Löschen. Lokal bleibt immer die Hauptkopie. */
export function CloudPanel({ kind, doc, stats, blocked, thumbnail }: Props) {
  const t = useT();
  const user = useAuth((s) => s.user);
  const status = useAuth((s) => s.status);
  const [open, setOpen] = useState(false);
  const [login, setLogin] = useState(false);
  const [meta, setMeta] = useState<DesignMeta | null | undefined>(undefined);
  const [visibility, setVisibility] = useState<Visibility>('private');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  /** JSON des zuletzt hochgeladenen Stands, um ungespeicherte Änderungen anzuzeigen. */
  const [uploaded, setUploaded] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Cloud-Stand beim ersten Öffnen laden (1 Request).
  useEffect(() => {
    if (!open || !user || meta !== undefined) return;
    let cancelled = false;
    api
      .design(doc.id)
      .then(({ design }) => {
        if (cancelled) return;
        setMeta(design);
        setVisibility(design.visibility);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) setMeta(null);
        else setMessage({ ok: false, text: apiErrorMessage(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [open, user, doc.id, meta]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  if (status === 'offline' || status === 'unavailable') return null;
  const url = `${window.location.origin}/v/${doc.id}`;
  const changed = uploaded !== null && uploaded !== JSON.stringify(doc);

  const save = async () => {
    if (!stats) return;
    setBusy(true);
    setMessage(null);
    try {
      const { design } = await api.saveDesign(doc.id, { kind, visibility, doc, stats });
      const image = await thumbnail().catch(() => null);
      if (image) await api.uploadThumb(doc.id, image).catch(() => undefined);
      setUploaded(JSON.stringify(doc));
      setMeta(design);
      if (!meta) useAuth.getState().setDesignCount((user?.designCount ?? 0) + 1);
      setMessage({ ok: true, text: t('cloud.saved', { version: design.version }) });
    } catch (err) {
      setMessage({ ok: false, text: apiErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!window.confirm(t('cloud.removeConfirm', { name: doc.meta.name }))) return;
    try {
      await api.deleteDesign(doc.id);
      setMeta(null);
      setUploaded(null);
      useAuth.getState().setDesignCount(Math.max(0, (user?.designCount ?? 1) - 1));
      setMessage({ ok: true, text: t('cloud.notSaved') });
    } catch (err) {
      setMessage({ ok: false, text: apiErrorMessage(err) });
    }
  };
  const copy = async () => {
    await navigator.clipboard.writeText(url).catch(() => undefined);
    setMessage({ ok: true, text: t('cloud.copied') });
  };

  return (
    <div className="settings-menu" ref={ref}>
      <button
        type="button"
        className={`btn small${meta ? '' : ' ghost'}`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        ☁ {t('cloud.title')}
        {changed && <span className="dot" aria-label={t('cloud.changed')} />}
      </button>
      {open && (
        <div className="settings-panel card cloud-panel">
          {!user ? (
            <>
              <p className="muted small">{t('auth.loginRequired')}</p>
              <button type="button" className="btn primary" onClick={() => setLogin(true)}>
                {t('auth.login')}
              </button>
            </>
          ) : (
            <>
              <p className="small">
                {meta
                  ? t('cloud.saved', { version: meta.version })
                  : meta === null
                    ? t('cloud.notSaved')
                    : t('common.loading')}
              </p>
              {changed && <p className="small warn-text">{t('cloud.changed')}</p>}
              <label>
                {t('cloud.visibility')}
                <select
                  className="select"
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value as Visibility)}
                >
                  {(['private', 'unlisted', 'public'] as const).map((v) => (
                    <option key={v} value={v}>
                      {t(`visibility.${v}`)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="btn primary"
                disabled={busy || blocked || !stats || meta === undefined}
                onClick={() => void save()}
              >
                {busy ? t('cloud.saving') : meta ? t('cloud.update') : t('cloud.save')}
              </button>
              {blocked && <p className="small form-error">{t('cloud.fixErrors')}</p>}
              {meta && meta.visibility !== 'private' && (
                <div className="row-buttons">
                  <button type="button" className="btn small" onClick={() => void copy()}>
                    {t('cloud.shareLink')}
                  </button>
                  <Link className="btn small" href={`/v/${doc.id}`}>
                    {t('cloud.open')}
                  </Link>
                </div>
              )}
              {meta && (
                <button
                  type="button"
                  className="btn small ghost danger"
                  onClick={() => void remove()}
                >
                  {t('cloud.remove')}
                </button>
              )}
              <p className="muted small">
                {t('cloud.quota', { count: user.designCount, limit: 50 })}
              </p>
            </>
          )}
          {message && (
            <p className={`small ${message.ok ? 'ok-note' : 'form-error'}`} role="status">
              {message.text}
            </p>
          )}
        </div>
      )}
      {login && <AuthDialog initialMode="login" onClose={() => setLogin(false)} />}
    </div>
  );
}
