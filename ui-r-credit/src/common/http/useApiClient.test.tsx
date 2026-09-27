import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { expect, test, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { z } from 'zod';
import { useApiClient } from './useApiClient';
import { AppProviders } from '../../app/AppProviders';
import { AppRoutes } from '../../app/routes/AppRoutes';
import { createSession } from '../../auth/services/session';
import { demoProfiles } from '../../../tests/auth/mocks/profiles';
import { server } from '../../../tests/common/testing/server';
import { locale, translations } from '../../../tests/pt-BR';
function Probe() {
  const api = useApiClient();
  return <button aria-label={translations[locale].demo.operator} onClick={() => { void api.request('/api/check', { schema: z.unknown() }).catch(() => undefined); }} />;
}
test('401 expira sessão, abre aviso acessível e encaminha ao acesso', async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  const text = translations[locale]; const user = userEvent.setup();
  server.use(http.get('/api/check', () => HttpResponse.json({ code: 'SESSAO_INVALIDA', message: text.http.status(401) }, { status: 401 })));
  const session = createSession(); session.signIn(demoProfiles.operator, demoProfiles.operator.subject);
  render(<MemoryRouter initialEntries={['/inexistente']}><AppProviders session={session}><Probe /><AppRoutes /></AppProviders></MemoryRouter>);
  await user.click(screen.getByRole('button', { name: text.demo.operator }));
  expect(await screen.findByRole('dialog')).toHaveTextContent(text.http.status(401));
  expect(session.getSnapshot().expired).toBe(true);
  await user.click(screen.getByRole('button', { name: text.common.understood }));
  expect(await screen.findByRole('heading', { name: text.auth.expired.title })).toBeVisible();
});
