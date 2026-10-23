import { Component, type ReactNode } from 'react';
import { translate } from '../i18n';
import { useSettings } from '../state/settings';

interface State {
  error: Error | undefined;
}

/** Fängt Renderfehler ab, damit nie eine leere Seite bleibt; lokale Daten bleiben unberührt. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, State> {
  override state: State = { error: undefined };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error)
      this.setState({ error: undefined });
  }

  override render() {
    if (!this.state.error) return this.props.children;
    const language = useSettings.getState().language;
    return (
      <main className="page">
        <h2>{translate(language, 'errors.title')}</h2>
        <p className="muted">{translate(language, 'errors.text')}</p>
        <pre className="error-detail">{this.state.error.message}</pre>
        <button type="button" className="btn" onClick={() => window.location.reload()}>
          {translate(language, 'errors.reload')}
        </button>
      </main>
    );
  }
}
