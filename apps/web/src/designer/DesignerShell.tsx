import { type ReactNode, useEffect, useState } from 'react';
import { Link } from 'wouter';
import { useT } from '../i18n';

export interface SectionDef {
  id: string;
  label: string;
}

interface Props {
  title: string;
  onRename: (name: string) => void;
  sections: SectionDef[];
  active: string;
  onSelect: (id: string) => void;
  history: { canUndo: boolean; canRedo: boolean; undo: () => void; redo: () => void };
  saveState: 'saved' | 'saving' | 'invalid';
  toolbar?: ReactNode;
  /** Zusätzliche Aktionen rechts in der Leiste (z. B. Cloud). */
  actions?: ReactNode;
  center: ReactNode;
  params: ReactNode;
}

/** Gemeinsames Layout: links Abschnitte, Mitte Ansicht/Ausgabe, rechts Parameter. */
export function DesignerShell({
  title,
  onRename,
  sections,
  active,
  onSelect,
  history,
  saveState,
  toolbar,
  actions,
  center,
  params,
}: Props) {
  const t = useT();
  const [name, setName] = useState<string | null>(null);

  // Strg/Cmd+Z, Strg/Cmd+Umschalt+Z bzw. Strg+Y – nicht während der Texteingabe.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('input[type="text"], input:not([type]), textarea, [contenteditable]'))
        return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        history.undo();
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        history.redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [history]);

  return (
    <div className="designer">
      <div className="designer-bar">
        <Link href="/garage" className="btn small ghost" aria-label={t('common.back')}>
          ←
        </Link>
        <input
          className="title-input"
          value={name ?? title}
          aria-label={t('common.name')}
          maxLength={80}
          onFocus={() => setName(title)}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            if (name?.trim() && name.trim() !== title) onRename(name.trim());
            setName(null);
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        {toolbar}
        <div className="spacer" />
        {actions}
        <button
          type="button"
          className="btn small ghost"
          disabled={!history.canUndo}
          onClick={history.undo}
          title={`${t('common.undo')} (Ctrl+Z)`}
        >
          ↶
        </button>
        <button
          type="button"
          className="btn small ghost"
          disabled={!history.canRedo}
          onClick={history.redo}
          title={`${t('common.redo')} (Ctrl+Shift+Z)`}
        >
          ↷
        </button>
        <span className={`save-state ${saveState}`} role="status">
          {saveState === 'saved'
            ? `✓ ${t('common.saved')}`
            : saveState === 'saving'
              ? t('common.saving')
              : t('designer.invalid')}
        </span>
      </div>
      <nav className="designer-nav" aria-label={t('designer.sections')}>
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-current={s.id === active ? 'step' : undefined}
            onClick={() => onSelect(s.id)}
          >
            {s.label}
          </button>
        ))}
      </nav>
      <div className="designer-center">{center}</div>
      <aside className="designer-params">{params}</aside>
    </div>
  );
}
