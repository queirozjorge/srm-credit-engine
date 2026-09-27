import { beforeEach, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { http, HttpResponse } from 'msw';
import { AppProviders } from '../../app/AppProviders';
import { AppRoutes } from '../../app/routes/AppRoutes';
import { createSession } from '../../auth/services/session';
import { demoProfiles } from '../../../tests/auth/mocks/profiles';
import { server } from '../../../tests/common/testing/server';
import { createDemoHandlers } from '../../../tests/app/mocks/handlers';
import { demoTime, demoUuid, failure } from '../../../tests/common/testing/demo';
import { batchFixture, receivableFixture } from '../../../tests/batch/mocks/fixtures';
import { batchDetailSchema } from '../services/contracts';
import { createBatchHandlers, type Scenario } from '../../../tests/batch/mocks/handlers';
import { requestFixture } from '../../../tests/settlement/mocks/fixtures';
import { requestSchema } from '../../settlement/services/contracts';
import { reprocessRequestSchema } from '../../settlement/services/reprocessContracts';
import { simulationInputSchema } from '../../pricing/services/contracts';
import { simulationFixture } from '../../../tests/pricing/mocks/fixtures';
import { locale, translations } from '../../../tests/pt-BR';
const text = translations[locale]; const copy = text.batch;
beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  server.use(...createDemoHandlers());
});
function open(path = '/lotes', manager = false) {
  const session = createSession(); const profile = manager ? demoProfiles.manager : demoProfiles.operator; session.signIn(profile, profile.subject);
  return render(<MemoryRouter initialEntries={[path]}><AppProviders session={session}><AppRoutes /></AppProviders></MemoryRouter>);
}

function reprocessScenario(total = 6, failedIndexes = [0, 5]): Scenario {
  const batchUuid = demoUuid(80);
  const failed = new Set(failedIndexes);
  const counts = { ready: 0, pending: 0, settled: total - failed.size, failed: failed.size };
  const status = counts.settled ? 'PARTIALLY_SETTLED' as const : 'FAILED' as const;
  const activeRequest = requestSchema.parse({ ...requestFixture, batchUuid, status, counts, completedAt: demoTime });
  const batch = batchDetailSchema.parse({ ...batchFixture, uuid: batchUuid, status, itemCount: total, faceValueBrl: total === 1 ? '1000.00' : '6000.00', counts, activeRequest });
  const items = Array.from({ length: total }, (_, index) => ({
    ...receivableFixture,
    uuid: demoUuid(100 + index),
    externalReference: `TITULO-${index + 1}`,
    processing: failed.has(index)
      ? { status: 'FAILED' as const, hasError: true, failure: { code: 'FALHA_DEMO', message: 'Falha demonstrativa.', stage: 'PROCESSING' as const, occurredAt: demoTime }, activeRequestUuid: activeRequest.uuid, attemptNumber: 1, settlementUuid: null }
      : { status: 'SETTLED' as const, hasError: false, failure: null, activeRequestUuid: activeRequest.uuid, attemptNumber: 1, settlementUuid: demoUuid(300 + index) },
  }));
  return { batch, items };
}

function selectedSimulationHandler() {
  return http.post('/api/simulations', async ({ request }) => {
    const input = simulationInputSchema.parse(await request.json());
    const ids = 'batchUuid' in input ? input.receivableUuids ?? [] : [];
    const template = simulationFixture.items[0]!;
    return HttpResponse.json({ ...simulationFixture,
      items: ids.map((uuid, index) => ({ ...template, itemIndex: index, receivableUuid: uuid })) });
  });
}
test('busca por qualquer cedente mantém lote misto completo; gestor só consulta', async () => {
  server.use(...createBatchHandlers([{ batch: { ...batchFixture, itemCount: 2, counts: { ready: 2, pending: 0, settled: 0, failed: 0 }, assignorCount: 2, soleAssignor: null, faceValueBrl: '2000.00' },
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
test.each(['READY', 'PENDING', 'SETTLED', 'PARTIALLY_SETTLED', 'FAILED'] as const)('apresenta estado contratual %s', async status => {
  const partial = status === 'PARTIALLY_SETTLED';
  const counts = status === 'READY' ? { ready: 1, pending: 0, settled: 0, failed: 0 }
    : status === 'PENDING' ? { ready: 0, pending: 1, settled: 0, failed: 0 }
      : status === 'SETTLED' ? { ready: 0, pending: 0, settled: 1, failed: 0 }
        : status === 'FAILED' ? { ready: 0, pending: 0, settled: 0, failed: 1 }
          : { ready: 0, pending: 0, settled: 1, failed: 1 };
  const activeRequest = status === 'READY' ? null : requestSchema.parse({ ...requestFixture, status, counts,
    completedAt: status === 'PENDING' ? null : requestFixture.acceptedAt });
  const batch = batchDetailSchema.parse({ ...batchFixture, status, itemCount: partial ? 2 : 1, counts, activeRequest });
  const items = partial ? [receivableFixture, { ...receivableFixture, uuid: demoUuid(20) }] : [receivableFixture];
  server.use(...createBatchHandlers([{ batch, items }]));
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
    server.use(...createBatchHandlers([{ batch: { ...batchFixture, itemCount: 6, counts: { ready: 6, pending: 0, settled: 0, failed: 0 }, faceValueBrl: '6000.00' },
      items: Array.from({ length: 6 }, (_, i) => ({ ...receivableFixture, uuid: demoUuid(100 + i), externalReference: `REF-${i}` })) }]));
    open(`/lotes/${batchFixture.uuid}?size=5`);
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: text.common.pagination.next }));
    await waitFor(() => expect(screen.getByRole('table')).toHaveTextContent('REF-5'));
    expect(pages).toEqual(['1', '2']); expect(details).toBe(1);
  } finally { server.events.removeListener('request:start', record); }
});

test('mantém o resumo acima das abas e consulta a auditoria somente quando selecionada', async () => {
  let auditReads = 0;
  server.use(http.get('/api/batches/:uuid/audit-events', () => {
    auditReads++;
    return HttpResponse.json({ items: [{ uuid: demoUuid(90), batchUuid: batchFixture.uuid, receivableUuid: null, requestUuid: null,
      attemptUuid: null, eventType: 'BATCH_CREATED', actor: demoProfiles.operator, registeredAt: demoTime, correlationId: 'demo-test',
      details: { source: 'FORM', itemCount: 1 } }], page: 1, size: 20, totalItems: 1, totalPages: 1 });
  }));
  open(`/lotes/${batchFixture.uuid}`);
  await screen.findByRole('table', { name: copy.receivables });
  expect(screen.getByText(copy.summary)).toBeInTheDocument();
  expect(auditReads).toBe(0);

  await userEvent.click(screen.getByRole('tab', { name: copy.detailTabs.audit }));
  const audit = await screen.findByRole('table', { name: text.settlement.audit.title });
  expect(audit).toHaveTextContent(text.settlement.audit.eventTypes.BATCH_CREATED);
  expect(screen.getByText(copy.summary)).toBeInTheDocument();
  expect(auditReads).toBe(1);
});

test('mostra falha individual em modal acessível e abre a auditoria pelo próprio erro', async () => {
  const failureInfo = { code: 'FALHA_DEMONSTRACAO', message: 'Não foi possível processar este título.', stage: 'PROCESSING' as const, occurredAt: demoTime };
  const settlementRequest = requestSchema.parse({ ...requestFixture, status: 'PARTIALLY_SETTLED', counts: { ready: 0, pending: 0, settled: 1, failed: 1 }, completedAt: demoTime });
  const batch = batchDetailSchema.parse({ ...batchFixture, status: 'PARTIALLY_SETTLED', itemCount: 2, faceValueBrl: '2000.00',
    counts: { ready: 0, pending: 0, settled: 1, failed: 1 }, activeRequest: settlementRequest });
  const failedItem = { ...receivableFixture, uuid: demoUuid(22), externalReference: 'DEMO-FAIL', processing: {
    status: 'FAILED' as const, hasError: true, failure: failureInfo, activeRequestUuid: settlementRequest.uuid, attemptNumber: 1, settlementUuid: null,
  } };
  const settledItem = { ...receivableFixture, uuid: demoUuid(23), processing: {
    status: 'SETTLED' as const, hasError: false, failure: null, activeRequestUuid: settlementRequest.uuid, attemptNumber: 1, settlementUuid: demoUuid(24),
  } };
  let auditedReceivable = '';
  server.use(...createBatchHandlers([{ batch, items: [settledItem, failedItem] }]), http.get('/api/batches/:uuid/audit-events', ({ request }) => {
    auditedReceivable = new URL(request.url).searchParams.get('receivableUuid') ?? '';
    return HttpResponse.json({ items: [{ uuid: demoUuid(90), batchUuid: batch.uuid, receivableUuid: failedItem.uuid, requestUuid: settlementRequest.uuid,
      attemptUuid: demoUuid(25), eventType: 'RECEIVABLE_SETTLEMENT_FAILED', actor: demoProfiles.operator, registeredAt: demoTime,
      correlationId: 'demo-test', details: { retryCount: 0, failure: failureInfo } }], page: 1, size: 20, totalItems: 1, totalPages: 1 });
  }));
  open(`/lotes/${batch.uuid}`);
  const table = await screen.findByRole('table', { name: copy.receivables });
  expect(screen.getAllByText(copy.statuses.PARTIALLY_SETTLED).length).toBeGreaterThan(0);
  expect(table).toHaveTextContent(copy.errorFlag);
  const errorAction = within(table).getByRole('button', { name: copy.failure });
  for (let cycle = 0; cycle < 5; cycle++) {
    await userEvent.click(errorAction);
    const closingDialog = await screen.findByRole('dialog', { name: copy.errorTitle(failedItem.externalReference) });
    if (cycle === 0) {
      await userEvent.click(within(closingDialog).getByRole('button', { name: text.common.understood }));
      fireEvent.click(errorAction);
    } else await userEvent.click(within(closingDialog).getByRole('button', { name: text.common.understood }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: copy.errorTitle(failedItem.externalReference) })).not.toBeInTheDocument());
  }
  await userEvent.click(errorAction);
  const dialog = await screen.findByRole('dialog', { name: copy.errorTitle(failedItem.externalReference) });
  expect(dialog).toHaveTextContent(failureInfo.message);
  expect(dialog).toHaveTextContent(text.settlement.audit.stage.PROCESSING);
  expect(dialog).toHaveTextContent(copy.errorOccurredAt);

  await userEvent.click(within(dialog).getByRole('button', { name: copy.auditAccess }));
  const audit = await screen.findByRole('table', { name: text.settlement.audit.title });
  expect(audit).toHaveTextContent(text.settlement.audit.eventTypes.RECEIVABLE_SETTLEMENT_FAILED);
  expect(auditedReceivable).toBe(failedItem.uuid);
  expect(screen.getByRole('tab', { name: copy.detailTabs.audit })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByText(copy.summary)).toBeInTheDocument();
});

test('seleciona somente falhos, preserva seleção entre páginas, abas e refetch, revisa simulação e confirma justificativa', async () => {
  const scenario = reprocessScenario();
  const submitted: { key: string | null; body: unknown }[] = [];
  const accepted = requestSchema.parse({ ...requestFixture, uuid: demoUuid(701), batchUuid: scenario.batch.uuid, kind: 'REPROCESS', reason: 'Revisão manual',
    status: 'PENDING', statusUrl: `/api/settlement-requests/${demoUuid(701)}`, counts: { ready: 0, pending: 2, settled: 0, failed: 0 }, completedAt: null });
  server.use(...createBatchHandlers([scenario]), selectedSimulationHandler(), http.post('/api/batches/:id/settlements', async ({ request }) => {
    submitted.push({ key: request.headers.get('Idempotency-Key'), body: reprocessRequestSchema.parse(await request.json()) });
    return HttpResponse.json(accepted, { status: 202 });
  }));
  open(`/lotes/${scenario.batch.uuid}?size=5`);
  const table = await screen.findByRole('table', { name: copy.receivables });
  const firstFailure = within(table).getByRole('checkbox', { name: copy.reprocess.selectTitle('TITULO-1', true) });
  const settled = within(table).getByRole('checkbox', { name: copy.reprocess.selectTitle('TITULO-2', false) });
  expect(settled).toBeDisabled();
  await userEvent.click(firstFailure);
  expect(screen.getByRole('button', { name: copy.reprocess.action(1) })).toBeEnabled();

  await userEvent.click(screen.getByRole('button', { name: text.common.pagination.next }));
  const secondPage = await screen.findByRole('table', { name: copy.receivables });
  expect(secondPage).toHaveTextContent('TITULO-6');
  expect(screen.getByRole('button', { name: copy.reprocess.action(1) })).toBeInTheDocument();
  await userEvent.click(within(secondPage).getByRole('checkbox', { name: copy.reprocess.selectTitle('TITULO-6', true) }));
  expect(screen.getByRole('button', { name: copy.reprocess.action(2) })).toBeEnabled();

  await userEvent.click(screen.getByRole('tab', { name: copy.detailTabs.requests }));
  await userEvent.click(screen.getByRole('tab', { name: copy.detailTabs.receivables }));
  await userEvent.click(screen.getByRole('button', { name: copy.refreshItems }));
  const refreshed = await screen.findByRole('table', { name: copy.receivables });
  expect(within(refreshed).getByRole('checkbox', { name: copy.reprocess.selectTitle('TITULO-6', true) })).toBeChecked();

  await userEvent.click(screen.getByRole('button', { name: copy.reprocess.action(2) }));
  const dialog = await screen.findByRole('dialog', { name: copy.reprocess.confirmTitle });
  expect(dialog).toHaveTextContent('TITULO-1');
  expect(dialog).toHaveTextContent('TITULO-6');
  await userEvent.click(within(dialog).getByRole('button', { name: copy.reprocess.confirm }));
  expect(within(dialog).getByText(copy.reprocess.justificationInvalid)).toBeInTheDocument();
  await userEvent.type(within(dialog).getByRole('textbox', { name: copy.reprocess.justification }), '  Revisão manual  ');
  expect(await within(dialog).findByText(copy.reprocess.simulationCurrent)).toBeInTheDocument();
  expect(dialog).toHaveTextContent(text.pricing.termMonths);
  await userEvent.click(within(dialog).getByRole('button', { name: copy.reprocess.confirm }));

  await waitFor(() => expect(submitted).toHaveLength(1));
  expect(submitted[0]?.key).toMatch(/^[0-9a-f-]{36}$/i);
  expect(submitted[0]?.body).toEqual({ receivableUuids: [demoUuid(100), demoUuid(105)], reason: 'Revisão manual' });
  await waitFor(() => expect(screen.queryByRole('dialog', { name: copy.reprocess.confirmTitle })).not.toBeInTheDocument());
  const updatedTable = await screen.findByRole('table', { name: copy.receivables });
  expect(within(updatedTable).getByRole('checkbox', { name: copy.reprocess.selectTitle('TITULO-6', true) })).not.toBeChecked();
});

test('gestor consulta títulos falhos sem controles para reprocessar', async () => {
  const scenario = reprocessScenario(1, [0]);
  server.use(...createBatchHandlers([scenario]));
  open(`/lotes/${scenario.batch.uuid}`, true);
  const table = await screen.findByRole('table', { name: copy.receivables });
  expect(within(table).queryByRole('checkbox')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: copy.reprocess.action(0) })).not.toBeInTheDocument();
  expect(within(table).getByRole('button', { name: copy.failure })).toBeEnabled();
});

test('refetch da página visível desmarca título que deixou de estar falho', async () => {
  const scenario = reprocessScenario(1, [0]);
  let reads = 0;
  const pendingItem = { ...scenario.items[0]!, processing: { status: 'PENDING' as const, hasError: false, failure: null,
    activeRequestUuid: scenario.batch.activeRequest!.uuid, attemptNumber: 2, settlementUuid: null } };
  server.use(http.get('/api/batches/:uuid/receivables', () => {
    reads++;
    const items = reads === 1 ? scenario.items : [pendingItem];
    return HttpResponse.json({ items, page: 1, size: 20, totalItems: 1, totalPages: 1 });
  }), ...createBatchHandlers([scenario]));
  open(`/lotes/${scenario.batch.uuid}`);
  let table = await screen.findByRole('table', { name: copy.receivables });
  const checkbox = within(table).getByRole('checkbox', { name: copy.reprocess.selectTitle('TITULO-1', true) });
  await userEvent.click(checkbox);
  expect(screen.getByRole('button', { name: copy.reprocess.action(1) })).toBeEnabled();
  await userEvent.click(screen.getByRole('button', { name: copy.refreshItems }));
  await waitFor(() => expect(reads).toBe(2));
  await waitFor(() => expect(screen.getByRole('table', { name: copy.receivables })).toHaveTextContent(copy.statuses.PENDING));
  table = screen.getByRole('table', { name: copy.receivables });
  expect(await within(table).findByRole('checkbox', { name: copy.reprocess.selectTitle('TITULO-1', false) })).not.toBeChecked();
  expect(within(table).getByRole('checkbox', { name: copy.reprocess.selectTitle('TITULO-1', false) })).toBeDisabled();
  expect(screen.getByRole('button', { name: copy.reprocess.action(0) })).toBeDisabled();
});

test('confirmação mantém ciclo estável em cinco aberturas e fechamento imediato não a reabre', async () => {
  const scenario = reprocessScenario(1, [0]);
  server.use(...createBatchHandlers([scenario]), selectedSimulationHandler());
  open(`/lotes/${scenario.batch.uuid}`);
  const table = await screen.findByRole('table', { name: copy.receivables });
  await userEvent.click(within(table).getByRole('checkbox', { name: copy.reprocess.selectTitle('TITULO-1', true) }));
  const action = screen.getByRole('button', { name: copy.reprocess.action(1) });
  for (let cycle = 0; cycle < 5; cycle++) {
    await userEvent.click(action);
    const dialog = await screen.findByRole('dialog', { name: copy.reprocess.confirmTitle });
    if (cycle === 0) {
      await userEvent.click(within(dialog).getByRole('button', { name: copy.reprocess.cancel }));
      fireEvent.click(action);
    } else await userEvent.click(within(dialog).getByRole('button', { name: copy.reprocess.cancel }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: copy.reprocess.confirmTitle })).not.toBeInTheDocument());
  }
});

test('falha de rede preserva seleção, justificativa e mesma chave para repetição explícita', async () => {
  const scenario = reprocessScenario(1, [0]);
  const submitted: { key: string | null; body: unknown }[] = [];
  const accepted = requestSchema.parse({ ...requestFixture, uuid: demoUuid(702), batchUuid: scenario.batch.uuid, kind: 'REPROCESS', reason: 'Revisão de rede',
    status: 'PENDING', statusUrl: `/api/settlement-requests/${demoUuid(702)}`, counts: { ready: 0, pending: 1, settled: 0, failed: 0 }, completedAt: null });
  server.use(...createBatchHandlers([scenario]), selectedSimulationHandler(), http.post('/api/batches/:id/settlements', async ({ request }) => {
    submitted.push({ key: request.headers.get('Idempotency-Key'), body: await request.json() });
    return submitted.length === 1 ? HttpResponse.error() : HttpResponse.json(accepted, { status: 202 });
  }));
  open(`/lotes/${scenario.batch.uuid}`);
  const table = await screen.findByRole('table', { name: copy.receivables });
  await userEvent.click(within(table).getByRole('checkbox', { name: copy.reprocess.selectTitle('TITULO-1', true) }));
  await userEvent.click(screen.getByRole('button', { name: copy.reprocess.action(1) }));
  let dialog = await screen.findByRole('dialog', { name: copy.reprocess.confirmTitle });
  await userEvent.type(within(dialog).getByRole('textbox', { name: copy.reprocess.justification }), 'Revisão de rede');
  await userEvent.click(within(dialog).getByRole('button', { name: copy.reprocess.confirm }));
  await waitFor(() => expect(screen.getByRole('dialog', { name: text.common.warning })).toBeInTheDocument());
  await userEvent.click(within(screen.getByRole('dialog', { name: text.common.warning })).getByRole('button', { name: text.common.understood }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: text.common.warning })).not.toBeInTheDocument());

  dialog = screen.getByRole('dialog', { name: copy.reprocess.confirmTitle });
  expect(within(dialog).getByRole('textbox', { name: copy.reprocess.justification })).toHaveValue('Revisão de rede');
  expect(dialog).toHaveTextContent('TITULO-1');
  await userEvent.click(within(dialog).getByRole('button', { name: copy.reprocess.repeat }));
  await waitFor(() => expect(submitted).toHaveLength(2));
  expect(submitted[1]).toEqual(submitted[0]);
});
