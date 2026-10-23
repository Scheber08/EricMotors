import { useEffect } from 'react';
import { useSettings } from '../state/settings';

/** Überträgt Theme und Sprache aus den Einstellungen auf das <html>-Element. */
export function useDocumentSettings() {
  const theme = useSettings((s) => s.theme);
  const language = useSettings((s) => s.language);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }, [theme]);
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
}
