import { lazy, Suspense } from 'react';
import { Route, Switch, useLocation } from 'wouter';
import { ErrorBoundary } from './app/ErrorBoundary';
import { Topbar } from './app/Topbar';
import { useDocumentSettings } from './app/useTheme';
import { useT } from './i18n';
import { GaragePage } from './pages/GaragePage';
import { HomePage } from './pages/HomePage';

// Designer mit 3D-Ansicht werden erst bei Bedarf geladen (kleineres Start-Bundle).
const CarDesigner = lazy(() =>
  import('./designer/CarDesigner').then((m) => ({ default: m.CarDesigner })),
);
const EngineDesigner = lazy(() =>
  import('./designer/EngineDesigner').then((m) => ({ default: m.EngineDesigner })),
);

export function App() {
  useDocumentSettings();
  const t = useT();
  const [location] = useLocation();
  return (
    <div className="app">
      <Topbar />
      <ErrorBoundary resetKey={location}>
        <Suspense fallback={<main className="page muted">{t('common.loading')}</main>}>
          <Switch>
            <Route path="/" component={HomePage} />
            <Route path="/garage" component={GaragePage} />
            <Route path="/car/:id">{(p) => <CarDesigner id={p.id} />}</Route>
            <Route path="/engine/:id">{(p) => <EngineDesigner id={p.id} />}</Route>
            <Route>
              <main className="page">{t('common.notFound')}</main>
            </Route>
          </Switch>
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
