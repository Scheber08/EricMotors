import type { Warning } from '@ericmotors/physics';
import { useT } from '../i18n';

/** Kennzahl-Kachel: Wert groß, Bezeichnung darunter. */
export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

/** Ratings 0–100 als Balken (eine Farbe, Länge = Wert; Zahl immer als Text sichtbar). */
export function RatingBars({ ratings, ns }: { ratings: Record<string, number>; ns: string }) {
  const t = useT();
  return (
    <ul className="ratings">
      {Object.entries(ratings).map(([key, value]) => (
        <li key={key}>
          <span className="rating-label">{t(`${ns}.${key}`)}</span>
          <span
            className="rating-track"
            role="meter"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(value)}
            aria-label={t(`${ns}.${key}`)}
          >
            <span className="rating-fill" style={{ width: `${Math.max(2, value)}%` }} />
          </span>
          <span className="rating-value">{Math.round(value)}</span>
        </li>
      ))}
    </ul>
  );
}

const ICON = { error: '⛔', warning: '⚠️', info: 'ℹ️' } as const;

/** Warnungen mit Erklärung und Lösungsvorschlag (warnings.<code>.text / .fix). */
export function WarningList({
  warnings,
  onSelect,
}: {
  warnings: Warning[];
  onSelect?: (w: Warning) => void;
}) {
  const t = useT();
  if (warnings.length === 0) return <p className="ok-note">✓ {t('designer.noWarnings')}</p>;
  return (
    <ul className="warnings">
      {warnings.map((w, i) => (
        <li key={`${w.code}-${i}`} className={`warning ${w.severity}`}>
          <button type="button" onClick={() => onSelect?.(w)}>
            <span aria-hidden="true">{ICON[w.severity]}</span>
            <span>
              <strong>{t(`warnings.${w.code}.text`)}</strong>
              <span className="fix">{t(`warnings.${w.code}.fix`)}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
