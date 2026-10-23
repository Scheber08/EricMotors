import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { BRAND } from '../brand';
import { AccountMenu } from '../community/AccountMenu';
import { useT } from '../i18n';
import { type Settings, useSettings } from '../state/settings';

function Segmented<K extends keyof Settings>({
  field,
  options,
}: {
  field: K;
  options: { value: Settings[K]; label: string }[];
}) {
  const value = useSettings((s) => s[field]);
  const set = useSettings((s) => s.set);
  return (
    <div className="segmented" role="group">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => set({ [field]: o.value } as Partial<Settings>)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function SettingsMenu() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div className="settings-menu" ref={ref}>
      <button
        type="button"
        className="btn ghost"
        aria-expanded={open}
        aria-label={t('app.settings.mode')}
        onClick={() => setOpen(!open)}
      >
        ⚙
      </button>
      {open && (
        <div className="settings-panel card">
          <label>
            {t('app.settings.mode')}
            <Segmented
              field="mode"
              options={[
                { value: 'beginner', label: t('app.settings.beginner') },
                { value: 'engineer', label: t('app.settings.engineer') },
              ]}
            />
          </label>
          <label>
            {t('app.settings.units')}
            <Segmented
              field="units"
              options={[
                { value: 'metric', label: t('app.settings.metric') },
                { value: 'imperial', label: t('app.settings.imperial') },
              ]}
            />
          </label>
          <label>
            {t('app.settings.power')}
            <Segmented
              field="power"
              options={[
                { value: 'kW', label: 'kW' },
                { value: 'PS', label: 'PS' },
                { value: 'hp', label: 'hp' },
              ]}
            />
          </label>
          <label>
            {t('app.settings.language')}
            <Segmented
              field="language"
              options={[
                { value: 'de', label: 'Deutsch' },
                { value: 'en', label: 'English' },
              ]}
            />
          </label>
          <label>
            {t('app.settings.theme')}
            <Segmented
              field="theme"
              options={[
                { value: 'system', label: t('app.settings.system') },
                { value: 'light', label: t('app.settings.light') },
                { value: 'dark', label: t('app.settings.dark') },
              ]}
            />
          </label>
        </div>
      )}
    </div>
  );
}

export function Topbar() {
  const t = useT();
  const [location] = useLocation();
  const link = (href: string, label: string) => (
    <Link href={href} aria-current={location === href ? 'page' : undefined}>
      {label}
    </Link>
  );
  return (
    <header className="topbar">
      <Link href="/" className="brand">
        {BRAND.prefix}
        <span>{BRAND.suffix}</span>
      </Link>
      <nav>
        {link('/', t('app.nav.home'))}
        {link('/garage', t('app.nav.garage'))}
        {link('/gallery', t('app.nav.gallery'))}
      </nav>
      <div className="spacer" />
      <AccountMenu />
      <SettingsMenu />
    </header>
  );
}
