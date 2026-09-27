import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { http } from 'msw';
import { AppProviders } from '../../app/AppProviders';
import { AppRoutes } from '../../app/routes/AppRoutes';
import { createSession } from '../../auth/services/session';
import { demoProfiles } from '../../auth/mocks/profiles';
import { server } from '../../common/testing/server';
import { createDemoHandlers } from '../../app/mocks/handlers';
import { demoUuid, failure } from '../../common/testing/demo';
import { batchFixture, receivableFixture } from '../mocks/fixtures';
import { createBatchHandlers } from '../mocks/handlers';
import { locale, translations } from '../../i18n/pt-BR';
vi.mock('../../app/config', () => ({ demoMode: true }));
const text = translations[locale]; const copy = text.batch;
beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  server.use(...createDemoHandlers());
});
function open(path = '/lotes', manager = false) {
  const session = createSession(); session.signIn(manager ? demoProfiles.manager : demoProfiles.operator);
  return render(<MemoryRouter initialEntries={[path]}><AppProviders session={session}><AppRoutes /></AppProviders></MemoryRouter>);
}
test('busca por qualquer cedente mantém lote misto completo; gestor só consulta', async () => {
  server.use(...createBatchHandlers([{ batch: { ...batchFixture, itemCount: 2, assignorCount: 2, soleAssignor: null, faceValueBrl: '2000.00' },
    items: [receivableFixture, { ...receivableFixture, uuid: demoUuid(20), assignorUuid: demoUuid(21), assignorName: 'Segundo cedente' }] }]));
  open('/lotes?q=Segundo', true);
  const table = await screen.findByRole('table');
  expect(table).toHaveTextContent(copy.mixed(2)); expect(table).toHaveTextContent('2.000,00');
  expect(screen.queryByRole('link', { name: copy.create.title })).not.toBeInTheDocument();
  await userEvent.click(within(table).getByRole('link', { name: copy.view }));
  expect(await screen.findByRole('table', { name: copy.receivables })).toHaveTextContent(receivableFixture.assignorName);
  expect(screen.getByRole('table', { name: copy.receivables })).toHaveTextContent('Segundo cedente');
  await userEvent.click(screen.getByRole('link', { name: copy.back }));
  expect(await screen.findByRole('searchbox')).toHaveValue('Segundo');
});
test.each(['READY', 'PENDING', 'SETTLED', 'FAILED'] as const)('apresenta estado contratual %s', async status => {
  server.use(...createBatchHandlers([{ batch: { ...batchFixture, status }, items: [receivableFixture] }]));
  open(); expect(await screen.findByRole('table')).toHaveTextContent(copy.statuses[status]);
});
test('404 não consulta recebíveis nem fabrica um lote vazio', async () => {
  let itemReads = 0;
  server.use(http.get('/api/batches/:id/receivables', () => { itemReads++; return failure(404, 'RECURSO_NAO_ENCONTRADO'); }));
  open(`/lotes/${demoUuid(999)}`);
  expect(await screen.findByRole('dialog')).toHaveTextContent(text.demo.missing);
  expect(itemReads).toBe(0); expect(screen.queryByText(copy.summary)).not.toBeInTheDocument();
});
test('UUID inválido é rejeitado localmente sem requisição', async () => {
  let reads = 0;
  server.use(http.get('/api/batches/:id', () => { reads++; return failure(404, 'RECURSO_NAO_ENCONTRADO'); }));
  open('/lotes/invalido');
  expect(await screen.findByRole('dialog')).toHaveTextContent(copy.invalidIdentifier);
  expect(reads).toBe(0);
});
test('paginação de itens consulta apenas a página solicitada sem repetir resumo', async () => {
  let details = 0; const pages: string[] = [];
  const record = ({ request }: { request: Request }) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith('/receivables')) pages.push(url.searchParams.get('page') ?? '');
    else if (url.pathname === `/api/batches/${batchFixture.uuid}`) details++;
  };
  server.events.on('request:start', record);
  try {
    server.use(...createBatchHandlers([{ batch: { ...batchFixture, itemCount: 6, faceValueBrl: '6000.00' },
      items: Array.from({ length: 6 }, (_, i) => ({ ...receivableFixture, uuid: demoUuid(100 + i), externalReference: `REF-${i}` })) }]));
    open(`/lotes/${batchFixture.uuid}?size=5`);
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: text.common.pagination.next }));
    await waitFor(() => expect(screen.getByRole('table')).toHaveTextContent('REF-5'));
    expect(pages).toEqual(['1', '2']); expect(details).toBe(1);
  } finally { server.events.removeListener('request:start', record); }
});
