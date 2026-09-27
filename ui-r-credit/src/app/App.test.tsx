import { server } from '../../tests/common/testing/server';
import { createDemoHandlers } from '../../tests/app/mocks/handlers';
import { StrictMode } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, test, vi } from 'vitest';
import { locale, translations } from '../../tests/pt-BR';
import { AppProviders } from './AppProviders';
import { AppRoutes } from './routes/AppRoutes';
import { createSession } from '../auth/services/session';
import { demoProfiles } from '../../tests/auth/mocks/profiles';
function App() { const session = createSession(); session.signIn(demoProfiles.operator, demoProfiles.operator.subject); return <AppProviders session={session}><AppRoutes /></AppProviders>; }

beforeEach(() => { server.use(...createDemoHandlers()); vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined); });

test('renderiza a aplicação com os provedores e textos centralizados', async () => {
  render(
    <StrictMode>
      <MemoryRouter>
        <App />
      </MemoryRouter>
    </StrictMode>,
  );

  expect(screen.getByRole('heading', {
    level: 1, name: translations[locale].dashboard.title,
  })).toBeVisible();
  expect(await screen.findByRole('group', { name: new RegExp(translations[locale].dashboard.chart) })).toBeVisible();
});

test.each([
  ['/lotes', translations[locale].batch.list.title],
  ['/lotes/novo', translations[locale].batch.create.title],
  ['/lotes/00000000-0000-4000-8000-000000000002', translations[locale].batch.detail.title],
  ['/cedentes', translations[locale].register.title],
  ['/cambio', translations[locale].exchange.title],
  ['/extrato', translations[locale].settlement.statement.title],
  ['/entrar', translations[locale].auth.signIn.title],
  ['/?code=example', translations[locale].auth.callback.title],
  ['/sessao-expirada', translations[locale].auth.expired.title],
  ['/acesso-negado', translations[locale].auth.forbidden.title],
  ['/inexistente', translations[locale].app.notFound.title],
])('resolve a rota %s', async (path, title) => {
  render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
  expect(await screen.findByRole('heading', { level: 1, name: title })).toBeVisible();
  expect(document.title).toContain(title);
});

test('protege rota sem sessão e preserva o destino', () => {
  render(<MemoryRouter initialEntries={['/lotes?page=3']}><AppProviders><AppRoutes /></AppProviders></MemoryRouter>);
  expect(screen.getByRole('heading', { name: translations[locale].auth.signIn.title })).toBeVisible();
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
});

test('identidade sem papel reconhecido não acessa telas de negócio', () => {
  const session = createSession(); session.signIn({ ...demoProfiles.operator, roles: [] });
  render(<MemoryRouter initialEntries={['/cedentes']}><AppProviders session={session}><AppRoutes /></AppProviders></MemoryRouter>);
  expect(screen.getByRole('heading', { name: translations[locale].auth.forbidden.title })).toBeVisible();
});
