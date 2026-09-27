import { DashboardPage } from '../../dashboard/pages/DashboardPage';
import { StatementPage } from '../../settlement/pages/StatementPage';
import { ExchangePage } from '../../exchange/pages/ExchangePage';
import { useEffect } from 'react';
import { Button } from '@mui/material';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { BatchWorkspace } from '../../batch/pages/BatchWorkspace';
import { BatchDetailPage } from '../../batch/pages/BatchDetailPage';
import { AssignorsPage } from '../../register/pages/AssignorsPage';
import { RequireSession } from './RequireSession';
import { SignInPage } from '../../auth/pages/SignInPage';
import { AccessPage } from '../../auth/pages/AccessPage';
import { PageScaffold } from '../../common/components/PageScaffold';
import { locale, translations } from '../../i18n/pt-BR';
import { AppShell } from '../components/AppShell';
import { NavigationMemoryProvider } from './NavigationMemoryProvider';
import { NavigationLink } from './NavigationLink';

export function AppRoutes() {
  const text = translations[locale];
  const { pathname, search } = useLocation();

  useEffect(() => {
    const heading = document.querySelector<HTMLElement>('h1');
    document.title = heading ? `${heading.textContent} · ${text.app.name}` : text.app.name;
    if (!document.querySelector('#page-content')) heading?.focus({ preventScroll: true });
  }, [pathname, text.app.name]);

  const returningFromAccess = new URLSearchParams(search).has('code') || new URLSearchParams(search).has('error');
  return (
    <NavigationMemoryProvider>
      <Routes>
        <Route path="/" element={returningFromAccess
          ? <AccessPage copy={text.auth.callback} to="/entrar" action={text.auth.returnToAccess} />
          : <Navigate to="/dashboard" replace />} />
        <Route element={<RequireSession />}><Route element={<AppShell />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/lotes" element={<BatchWorkspace />}>
          <Route element={<RequireSession permission="batchWrite" />}><Route path="novo" element={null} /></Route>
          <Route path=":batchUuid" element={<BatchDetailPage />} />
          </Route>
          <Route path="/cedentes" element={<AssignorsPage />} />
          <Route path="/cambio" element={<ExchangePage />} />
          <Route path="/extrato" element={<StatementPage />} />
          <Route path="*" element={<PageScaffold copy={text.app.notFound} pending={false} action={
            <Button component={NavigationLink} to="/dashboard" variant="contained">{text.app.backToDashboard}</Button>
          } />} />
        </Route>
        </Route>
        <Route path="/entrar" element={<SignInPage />} />
        <Route path="/sessao-expirada" element={<AccessPage copy={text.auth.expired} to="/entrar" action={text.auth.returnToAccess} />} />
        <Route path="/acesso-negado" element={<AccessPage copy={text.auth.forbidden} action={text.app.backToDashboard} />} />
      </Routes>
    </NavigationMemoryProvider>
  );
}
