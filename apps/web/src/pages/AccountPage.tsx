import { useState } from 'react';
import { useLocation } from 'wouter';
import { PASSWORD_MIN_LENGTH } from '@ericmotors/schema';
import { apiErrorMessage } from '../community/errors';
import { useT } from '../i18n';
import { useAuth } from '../state/auth';

export function AccountPage() {
  const t = useT();
  const [, navigate] = useLocation();
  const user = useAuth((s) => s.user);
  const [oldPassword, setOld] = useState('');
  const [newPassword, setNew] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!user) return <main className="page muted">{t('auth.loginRequired')}</main>;

  const change = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < PASSWORD_MIN_LENGTH)
      return setMessage({ ok: false, text: t('auth.tooShort') });
    setBusy(true);
    try {
      await useAuth.getState().changePassword(oldPassword, newPassword);
      setMessage({ ok: true, text: t('auth.passwordChanged') });
      setOld('');
      setNew('');
    } catch (err) {
      setMessage({ ok: false, text: apiErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!window.confirm(t('auth.deleteAccountConfirm', { name: user.username }))) return;
    try {
      await useAuth.getState().deleteAccount();
      navigate('/');
    } catch (err) {
      setMessage({ ok: false, text: apiErrorMessage(err) });
    }
  };

  return (
    <main className="page narrow">
      <h1>{t('auth.account')}</h1>
      <p>
        <strong>{user.username}</strong>
      </p>
      <form className="card dialog-form" onSubmit={(e) => void change(e)}>
        <h2>{t('auth.changePassword')}</h2>
        <input type="text" autoComplete="username" value={user.username} hidden readOnly />
        <label className="field">
          <span className="field-label">{t('auth.oldPassword')}</span>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            value={oldPassword}
            onChange={(e) => setOld(e.target.value)}
            required
          />
        </label>
        <label className="field">
          <span className="field-label">{t('auth.newPassword')}</span>
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNew(e.target.value)}
            required
          />
        </label>
        {message && (
          <p className={message.ok ? 'ok-note' : 'form-error'} role="status">
            {message.text}
          </p>
        )}
        <div className="dialog-actions">
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? t('auth.working') : t('auth.changePassword')}
          </button>
        </div>
      </form>
      <div className="danger-zone">
        <button type="button" className="btn danger" onClick={() => void remove()}>
          {t('auth.deleteAccount')}
        </button>
        <p className="muted small">{t('auth.privacy')}</p>
      </div>
    </main>
  );
}
