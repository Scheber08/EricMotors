import { useEffect, useId, useRef, useState } from 'react';
import { PASSWORD_MIN_LENGTH, Username } from '@ericmotors/schema';
import { useT } from '../i18n';
import { useAuth } from '../state/auth';
import { apiErrorMessage } from './errors';

/** Modal zum Anmelden bzw. Registrieren mit Benutzername und Passwort. */
export function AuthDialog({
  initialMode,
  onClose,
}: {
  initialMode: 'login' | 'register';
  onClose: () => void;
}) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [mode, setMode] = useState(initialMode);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { login, register } = useAuth.getState();

  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!Username.safeParse(username).success) return setError(t('auth.invalidUsername'));
    if (mode === 'register') {
      if (password.length < PASSWORD_MIN_LENGTH) return setError(t('auth.tooShort'));
      if (password !== repeat) return setError(t('auth.mismatch'));
    }
    setBusy(true);
    try {
      await (mode === 'login' ? login(username, password) : register(username, password));
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog ref={ref} className="dialog card" onClose={onClose} aria-labelledby={`${id}-title`}>
      <form onSubmit={(e) => void submit(e)} className="dialog-form">
        <h2 id={`${id}-title`}>{mode === 'login' ? t('auth.login') : t('auth.register')}</h2>
        <label className="field">
          <span className="field-label">{t('auth.username')}</span>
          <input
            className="input"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            maxLength={24}
            autoFocus
          />
          {mode === 'register' && <span className="muted small">{t('auth.usernameHint')}</span>}
        </label>
        <label className="field">
          <span className="field-label">{t('auth.password')}</span>
          <input
            className="input"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {mode === 'register' && (
          <>
            <label className="field">
              <span className="field-label">{t('auth.passwordRepeat')}</span>
              <input
                className="input"
                type="password"
                autoComplete="new-password"
                value={repeat}
                onChange={(e) => setRepeat(e.target.value)}
                required
              />
            </label>
            <p className="muted small">{t('auth.passwordHint', { min: PASSWORD_MIN_LENGTH })}</p>
          </>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button
            type="button"
            className="btn ghost"
            onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
          >
            {mode === 'login' ? t('auth.noAccount') : t('auth.haveAccount')}
          </button>
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? t('auth.working') : mode === 'login' ? t('auth.login') : t('auth.register')}
          </button>
        </div>
        <p className="muted small">{t('auth.privacy')}</p>
      </form>
    </dialog>
  );
}
