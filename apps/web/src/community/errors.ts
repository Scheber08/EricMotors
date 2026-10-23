import { hasTranslation, translate } from '../i18n';
import { ApiError } from '../api/client';
import { useSettings } from '../state/settings';

/** Übersetzt einen API-Fehler in eine verständliche Meldung. */
export function apiErrorMessage(error: unknown): string {
  const language = useSettings.getState().language;
  const code = error instanceof ApiError ? error.code : 'error';
  const key = hasTranslation(language, `errors.api.${code}`)
    ? `errors.api.${code}`
    : 'errors.api.error';
  const detail = error instanceof ApiError ? error.detail : undefined;
  return translate(language, key, detail as Record<string, string | number> | undefined);
}
