import { useId, useState } from 'react';
import { hasTranslation, useT } from '../i18n';
import { useSettings } from '../state/settings';

/**
 * Info-Knopf mit Erklärung eines Parameters (help.<key>), im Ingenieur-Modus zusätzlich mit
 * Formel bzw. Modellhinweis (formula.<key>), sofern vorhanden.
 */
export function Help({ helpKey }: { helpKey: string }) {
  const t = useT();
  const language = useSettings((s) => s.language);
  const engineer = useSettings((s) => s.mode === 'engineer');
  const [open, setOpen] = useState(false);
  const id = useId();
  if (!hasTranslation(language, `help.${helpKey}`)) return null;
  const formula =
    engineer && hasTranslation(language, `formula.${helpKey}`)
      ? t(`formula.${helpKey}`)
      : undefined;
  return (
    <span className="help">
      <button
        type="button"
        className="help-btn"
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => setOpen(!open)}
        onBlur={() => setOpen(false)}
      >
        ?
      </button>
      {open && (
        <span role="tooltip" id={id} className="help-pop card">
          {t(`help.${helpKey}`)}
          {formula && <code>{formula}</code>}
        </span>
      )}
    </span>
  );
}
