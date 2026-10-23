import { useId, useState } from 'react';
import { useLocale, useT } from '../i18n';
import { getPath } from '../lib/path';
import { useSettings } from '../state/settings';
import { type Quantity, unitFor } from '../units/format';
import { Help } from './Help';

/**
 * Eingabefelder, die direkt auf einen Pfad im Dokument schreiben. Werte sind immer SI;
 * Anzeige und Eingabe erfolgen in der gewählten Einheit.
 */
export interface FieldContext {
  doc: unknown;
  onChange: (path: string, value: unknown) => void;
  /** Präfix für Übersetzungsschlüssel (z. B. „engine“ → params.engine.<feld>). */
  ns: string;
  /** Pfade mit Warnungen werden hervorgehoben. */
  flagged?: Set<string>;
}

interface BaseProps {
  ctx: FieldContext;
  path: string;
  /** Übersetzungsschlüssel, falls abweichend vom letzten Pfadsegment. */
  label?: string;
  /** Nur im Ingenieur-Modus anzeigen. */
  engineer?: boolean;
}

function useField(props: BaseProps) {
  const t = useT();
  const mode = useSettings((s) => s.mode);
  const key = `${props.ctx.ns}.${
    props.label ??
    props.path
      .split('.')
      .filter((p) => !/^\d+$/.test(p))
      .pop()
  }`;
  const hidden = props.engineer && mode !== 'engineer';
  const flagged = props.ctx.flagged?.has(props.path) ?? false;
  return { t, key, hidden, flagged, value: getPath(props.ctx.doc, props.path) };
}

function Row({
  id,
  label,
  helpKey,
  flagged,
  children,
}: {
  id: string;
  label: string;
  helpKey: string;
  flagged: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`field${flagged ? ' flagged' : ''}`}>
      <div className="field-label">
        <label htmlFor={id}>{label}</label>
        <Help helpKey={helpKey} />
      </div>
      {children}
    </div>
  );
}

/** Zahl mit Einheit: Schieberegler plus Eingabefeld. min/max/step in SI. */
export function NumberField(
  props: BaseProps & {
    quantity: Quantity;
    min: number;
    max: number;
    step?: number;
    integer?: boolean;
  },
) {
  const { t, key, hidden, flagged, value } = useField(props);
  const units = useSettings((s) => s.units);
  const power = useSettings((s) => s.power);
  const locale = useLocale();
  const id = useId();
  const u = unitFor(props.quantity, { units, power });
  const si = typeof value === 'number' ? value : 0;
  const display = u.toDisplay(si);
  const lo = u.toDisplay(props.min);
  const hi = u.toDisplay(props.max);
  const step =
    props.step !== undefined
      ? Math.abs(u.toDisplay(props.step) - u.toDisplay(0))
      : Math.abs(hi - lo) / 200 || 1;
  const digits = props.integer ? 0 : u.digits;
  // Während der Eingabe zeigt das Feld den Entwurf, sonst den formatierten Wert.
  const [draft, setDraft] = useState<string | null>(null);
  const formatted = display.toLocaleString(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    useGrouping: false,
  });
  if (hidden) return null;

  const commit = (displayValue: number) => {
    if (!Number.isFinite(displayValue)) return;
    let v = u.fromDisplay(displayValue);
    v = Math.min(Math.max(v, Math.min(props.min, props.max)), Math.max(props.min, props.max));
    if (props.integer) v = Math.round(v);
    props.ctx.onChange(props.path, v);
  };

  return (
    <Row id={id} label={t(key)} helpKey={key} flagged={flagged}>
      <div className="number-field">
        <input
          type="range"
          min={Math.min(lo, hi)}
          max={Math.max(lo, hi)}
          step={step}
          value={display}
          aria-label={t(key)}
          onChange={(e) => commit(Number(e.target.value))}
        />
        <span className="number-input">
          <input
            id={id}
            className="input"
            inputMode="decimal"
            value={draft ?? formatted}
            onFocus={() => setDraft(formatted)}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              if (draft !== null) commit(Number(draft.replace(',', '.')));
              setDraft(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && draft !== null) commit(Number(draft.replace(',', '.')));
            }}
            lang={locale}
          />
          <span className="unit">{u.unit}</span>
        </span>
      </div>
    </Row>
  );
}

/** Regler 0..1, angezeigt als 0–100 %. */
export function SliderField(props: BaseProps) {
  const { t, key, hidden, flagged, value } = useField(props);
  const id = useId();
  if (hidden) return null;
  const v = typeof value === 'number' ? value : 0;
  return (
    <Row id={id} label={t(key)} helpKey={key} flagged={flagged}>
      <div className="number-field">
        <input
          id={id}
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={v}
          onChange={(e) => props.ctx.onChange(props.path, Number(e.target.value))}
        />
        <span className="slider-value">{Math.round(v * 100)}&nbsp;%</span>
      </div>
    </Row>
  );
}

/** Qualitätsregler −5 … +5 wie in Automation. */
export function QualityField(props: BaseProps) {
  const { t, key, hidden, value } = useField({ ...props, label: props.label ?? 'quality' });
  const id = useId();
  if (hidden) return null;
  const v = typeof value === 'number' ? value : 0;
  return (
    <Row id={id} label={t(key)} helpKey={key} flagged={false}>
      <div className="number-field">
        <input
          id={id}
          type="range"
          min={-5}
          max={5}
          step={1}
          value={v}
          onChange={(e) => props.ctx.onChange(props.path, Number(e.target.value))}
        />
        <span className={`slider-value quality q${Math.sign(v)}`}>{v > 0 ? `+${v}` : v}</span>
      </div>
    </Row>
  );
}

/** Auswahl aus festen Optionen; Beschriftungen unter options.<ns>.<feld>.<wert>. */
export function SelectField(
  props: BaseProps & { options: readonly (string | number)[]; optionKey?: string },
) {
  const { t, key, hidden, flagged, value } = useField(props);
  const id = useId();
  if (hidden) return null;
  const optionNs = `options.${props.optionKey ?? key}`;
  const isNumber = typeof props.options[0] === 'number';
  return (
    <Row id={id} label={t(key)} helpKey={key} flagged={flagged}>
      <select
        id={id}
        className="select"
        value={String(value)}
        onChange={(e) =>
          props.ctx.onChange(props.path, isNumber ? Number(e.target.value) : e.target.value)
        }
      >
        {props.options.map((o) => (
          <option key={o} value={String(o)}>
            {isNumber ? o : t(`${optionNs}.${o}`)}
          </option>
        ))}
      </select>
    </Row>
  );
}

export function ToggleField(props: BaseProps) {
  const { t, key, hidden, flagged, value } = useField(props);
  const id = useId();
  if (hidden) return null;
  return (
    <div className={`field toggle${flagged ? ' flagged' : ''}`}>
      <div className="field-label">
        <label htmlFor={id}>{t(key)}</label>
        <Help helpKey={key} />
      </div>
      <input
        id={id}
        type="checkbox"
        checked={value === true}
        onChange={(e) => props.ctx.onChange(props.path, e.target.checked)}
      />
    </div>
  );
}

export function ColorField(props: BaseProps) {
  const { t, key, hidden, value } = useField(props);
  const id = useId();
  if (hidden) return null;
  return (
    <Row id={id} label={t(key)} helpKey={key} flagged={false}>
      <input
        id={id}
        type="color"
        className="color-input"
        value={String(value)}
        onChange={(e) => props.ctx.onChange(props.path, e.target.value)}
      />
    </Row>
  );
}

export function FieldGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="field-group">
      <legend>{title}</legend>
      {children}
    </fieldset>
  );
}
