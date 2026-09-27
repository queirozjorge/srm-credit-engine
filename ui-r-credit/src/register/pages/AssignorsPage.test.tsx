import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { http, HttpResponse } from 'msw';
import { AppProviders } from '../../app/AppProviders';
import { AppRoutes } from '../../app/routes/AppRoutes';
import { createSession } from '../../auth/services/session';
import { demoProfiles } from '../../auth/mocks/profiles';
import { server } from '../../common/testing/server';
import { createDemoHandlers } from '../../app/mocks/handlers';
import { assignorFixture } from '../mocks/fixtures';
import { translations, locale } from '../../i18n/pt-BR';
vi.mock('../../app/config', () => ({ demoMode: true }));
const text = translations[locale]; const copy = text.register;
beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  server.use(...createDemoHandlers());
});
function open(path = '/cedentes') {
  const session = createSession(); session.signIn(demoProfiles.operator);
  return render(<MemoryRouter initialEntries={[path]}><AppProviders session={session}><AppRoutes /></AppProviders></MemoryRouter>);
}
async function dismiss() {
  await userEvent.click(await screen.findByRole('button', { name: text.common.understood }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: text.common.warning })).not.toBeInTheDocument());
}
test('detalhe de cedente inativo permanece consultável sem oferecer reativação', async () => {
  server.use(http.get('/api/assignors/:uuid', () => HttpResponse.json({ ...assignorFixture, deleted: true })));
  open(`/cedentes?cedente=${assignorFixture.uuid}`);
  expect(await screen.findByText(copy.inactive, { exact: true })).toBeVisible();
  expect(await screen.findByRole('button', { name: copy.edit })).toBeEnabled();
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
});
test('404 no detalhe abre aviso sem simular cadastro; filtros permanecem ao voltar', async () => {
  open('/cedentes?q=Exemplo&page=2&cedente=00000000-0000-4000-8000-000000000099');
  expect(await screen.findByRole('dialog', { name: text.common.warning })).toHaveTextContent(text.demo.missing);
  await dismiss();
  expect(screen.queryByRole('button', { name: copy.edit })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: copy.back }));
  expect(await screen.findByRole('searchbox', { name: copy.search })).toHaveValue('Exemplo');
  expect(await screen.findByRole('table')).toHaveTextContent(copy.empty);
});
test('falha de consulta após POST aceito mantém dados e permite somente repetir GET', async () => {
  let reads = 0; let writes = 0;
  server.use(http.get('/api/assignors', () => {
    reads++;
    return reads === 2 ? HttpResponse.json({ code: 'ERRO_INTERNO', message: 'error' }, { status: 500 })
      : HttpResponse.json({ items: [assignorFixture], page: 1, size: 20, totalItems: 1, totalPages: 1 });
  }), http.post('/api/assignors', () => { writes++; return HttpResponse.json({ uuid: assignorFixture.uuid }, { status: 201 }); }));
  open(); await screen.findByRole('table');
  await userEvent.click(screen.getByRole('button', { name: copy.create }));
  const form = within(screen.getByRole('dialog', { name: copy.create }));
  await userEvent.type(form.getByRole('textbox', { name: copy.name }), 'Meu rascunho');
  await userEvent.type(form.getByRole('textbox', { name: copy.document }), '11444777000161');
  await userEvent.click(form.getByRole('button', { name: copy.save }));
  await screen.findByRole('dialog', { name: text.common.warning }); await dismiss();
  expect(form.getByRole('textbox', { name: copy.name })).toHaveValue('Meu rascunho');
  expect(form.getByRole('button', { name: copy.save })).toBeDisabled();
  await userEvent.click(form.getByRole('button', { name: copy.refreshSaved }));
  await screen.findByRole('dialog', { name: copy.savedTitle });
  expect(writes).toBe(1); expect(reads).toBe(3);
});
