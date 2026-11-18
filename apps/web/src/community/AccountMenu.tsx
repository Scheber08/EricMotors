import { useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { useT } from '../i18n';
import { useAuth } from '../state/auth';
import { AuthDialog } from './AuthDialog';

/** Anmelden-Knopf bzw. Benutzermenü in der Kopfzeile. */
export function AccountMenu() {
  const t = useT();
  const user = useAuth((s) => s.user);
  const status = useAuth((s) => s.status);
  const [dialog, setDialog] = useState<'login' | 'register' | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  if (status === 'unavailable' || status === 'offline') return null;
  if (!user) {
    return (
      <>
        <button type="button" className="btn small" onClick={() => setDialog('login')}>
          {t('auth.login')}
        </button>
        {dialog && <AuthDialog initialMode={dialog} onClose={() => setDialog(null)} />}
      </>
    );
  }
  return (
    <div className="settings-menu" ref={ref}>
      <button
        type="button"
        className="btn small ghost"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        👤 {user.username}
      </button>
      {open && (
        <div className="settings-panel card menu" onClick={() => setOpen(false)}>
          <Link href={`/u/${user.username}`}>{t('auth.profile')}</Link>
          <Link href="/account">{t('auth.account')}</Link>
          <button
            type="button"
            className="btn ghost"
            onClick={() => void useAuth.getState().logout()}
          >
            {t('auth.logout')}
          </button>
        </div>
      )}
    </div>
  );
}
