import { useEffect, useState } from 'react';

type Health =
  | { state: 'loading' }
  | { state: 'ok'; environment: string; database: string }
  | { state: 'offline' };

export function App() {
  const [health, setHealth] = useState<Health>({ state: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/health', { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { environment: string; database: string }) =>
        setHealth({ state: 'ok', environment: data.environment, database: data.database }),
      )
      .catch(() => {
        if (!controller.signal.aborted) setHealth({ state: 'offline' });
      });
    return () => controller.abort();
  }, []);

  return (
    <main className="hero">
      <h1>
        Eric<span>Motors</span>
      </h1>
      <p>Konstruiere dein eigenes Auto – ingenieursnah, bis ins kleinste Detail.</p>
      <p className="status" aria-live="polite">
        {health.state === 'loading' && 'Verbinde mit der Cloud …'}
        {health.state === 'ok' &&
          `Cloud verbunden · Umgebung: ${health.environment} · Datenbank: ${health.database}`}
        {health.state === 'offline' &&
          'Cloud-Funktionen gerade nicht erreichbar. Der Konfigurator funktioniert trotzdem lokal.'}
      </p>
    </main>
  );
}
