import { expect, test, vi } from 'vitest';
import { createApiClient } from '../../common/http/client';
import { server } from '../../common/testing/server';
import { demoUuid } from '../../common/testing/demo';
import { pageOf } from '../../common/http/contracts';
import { batchFixture, receivableFixture } from '../../batch/mocks/fixtures';
import { batchDetailSchema } from '../../batch/services/contracts';
import { createPricingHandlers } from '../../pricing/mocks/handlers';
import { simulationSchema } from '../../pricing/services/contracts';
import { quoteFixture } from '../../exchange/mocks/fixtures';
import { createExchangeStore } from '../../exchange/mocks/handlers';
import { createDashboardHandlers } from '../../dashboard/mocks/handlers';
import { dashboardSchema } from '../../dashboard/services/contracts';
import { auditEventPageSchema, requestItemPageSchema, requestSchema, statementPageSchema } from '../services/contracts';
import type { LedgerItem } from './statementHandlers';
import { createSettlementHandlers } from './handlers';

const api = createApiClient({ headers: () => ({ 'X-Demo-Subject': 'operador-demo' }) });
const requestPageSchema = pageOf(requestSchema);

function createTenTitleBatch() {
  const items = Array.from({ length: 10 }, (_, index) => ({ ...receivableFixture,
    uuid: demoUuid(100 + index), externalReference: `PARCIAL-${String(index + 1).padStart(2, '0')}` }));
  const batch = batchDetailSchema.parse({ ...batchFixture, itemCount: items.length, faceValueBrl: '10000.00',
    counts: { ready: items.length, pending: 0, settled: 0, failed: 0 } });
  return { batch, items };
}

test('mock processa nove títulos com sucesso, preserva um erro e reflete resultados enquanto o lote aguarda', async () => {
  const scenario = createTenTitleBatch(); const batches = [scenario]; const ledger: LedgerItem[] = [];
  const exchange = createExchangeStore();
  server.use(...createSettlementHandlers(batches, 'PARTIAL', () => quoteFixture, ledger), ...createPricingHandlers(batches),
    ...createDashboardHandlers(batches, exchange, ledger));

  const simulation = await api.request('/api/simulations', { method: 'POST', schema: simulationSchema, body: { batchUuid: scenario.batch.uuid } });
  expect(simulation.data.items).toHaveLength(10);
  expect(simulation.data.totals).toMatchObject({ faceValueBrl: '10000.00', paymentBrl: '10000.00' });

  const accepted = await api.request(`/api/batches/${scenario.batch.uuid}/settlements`, { method: 'POST', statuses: [202],
    schema: requestSchema, idempotencyKey: 'partial-demo-01' });
  expect(accepted.data.counts).toEqual({ ready: 0, pending: 10, settled: 0, failed: 0 });

  vi.setSystemTime(new Date(Date.parse(accepted.data.acceptedAt) + 5000));
  const progressing = await api.request(`/api/batches/${scenario.batch.uuid}`, { schema: batchDetailSchema });
  expect(progressing.data).toMatchObject({ status: 'PENDING', counts: { ready: 0, pending: 1, settled: 9, failed: 0 },
    settledTotals: { faceValueBrl: '9000.00', paymentBrl: '9000.00' }, progressVersion: '19' });
  const progressingItems = await api.request(`/api/settlement-requests/${accepted.data.uuid}/items`, { schema: requestItemPageSchema });
  expect(progressingItems.data.items.filter(item => item.status === 'SETTLED')).toHaveLength(9);
  expect(progressingItems.data.items.filter(item => item.status === 'PENDING')).toHaveLength(1);
  const inProgressStatement = await api.request('/api/settlements/items', { schema: statementPageSchema });
  expect(inProgressStatement.data.totalItems).toBe(9);
  const inProgressDashboard = await api.request('/api/dashboard', { schema: dashboardSchema });
  expect(inProgressDashboard.data.batchCounts).toMatchObject({ PENDING: 1 });
  expect(inProgressDashboard.data.totals).toMatchObject({ faceValueBrl: '9000.00', paymentBrl: '9000.00' });

  vi.setSystemTime(new Date(Date.parse(accepted.data.acceptedAt) + 10000));
  const completed = await api.request(`/api/batches/${scenario.batch.uuid}`, { schema: batchDetailSchema });
  expect(completed.data).toMatchObject({ status: 'PARTIALLY_SETTLED', counts: { ready: 0, pending: 0, settled: 9, failed: 1 },
    settledTotals: { faceValueBrl: '9000.00', paymentBrl: '9000.00' }, progressVersion: '20', activeRequest: { status: 'PARTIALLY_SETTLED' } });
  const items = await api.request(`/api/settlement-requests/${accepted.data.uuid}/items`, { schema: requestItemPageSchema });
  expect(items.data.items.filter(item => item.status === 'SETTLED' && item.result !== null)).toHaveLength(9);
  const failed = items.data.items.find(item => item.status === 'FAILED');
  expect(failed).toMatchObject({ hasError: true, result: null, failure: { stage: 'PROCESSING' }, receivable: { processing: { status: 'FAILED', hasError: true } } });
  const statement = await api.request('/api/settlements/items', { schema: statementPageSchema });
  expect(statement.data.totalItems).toBe(9);
  const dashboard = await api.request('/api/dashboard', { schema: dashboardSchema });
  expect(dashboard.data.batchCounts).toMatchObject({ PARTIALLY_SETTLED: 1 });
  expect(dashboard.data.totals).toMatchObject({ faceValueBrl: '9000.00', paymentBrl: '9000.00' });

  await expect(api.request(`/api/batches/${scenario.batch.uuid}/settlements`, { method: 'POST', statuses: [202], schema: requestSchema,
    idempotencyKey: 'partial-demo-02' })).rejects.toMatchObject({ status: 409, code: 'REPROCESSAMENTO_EXIGE_SELECAO' });
});

test('reprocessa somente título falho, mantém sucessos e tentativa anterior e cria snapshot e auditoria próprios', async () => {
  const scenario = createTenTitleBatch(); const batches = [scenario]; const ledger: LedgerItem[] = [];
  let currentQuote = quoteFixture;
  server.use(...createSettlementHandlers(batches, 'PARTIAL', () => currentQuote, ledger), ...createPricingHandlers(batches),
    ...createDashboardHandlers(batches, createExchangeStore(), ledger));

  const initial = await api.request(`/api/batches/${scenario.batch.uuid}/settlements`, { method: 'POST', statuses: [202],
    schema: requestSchema, idempotencyKey: 'partial-initial-01' });
  vi.setSystemTime(new Date(Date.parse(initial.data.acceptedAt) + 10000));
  const afterInitial = await api.request(`/api/batches/${scenario.batch.uuid}`, { schema: batchDetailSchema });
  expect(afterInitial.data).toMatchObject({ status: 'PARTIALLY_SETTLED', counts: { settled: 9, failed: 1 } });
  const initialItems = await api.request(`/api/settlement-requests/${initial.data.uuid}/items`, { schema: requestItemPageSchema });
  const failed = initialItems.data.items.find(item => item.status === 'FAILED');
  expect(failed).toBeDefined();
  if (!failed) throw new Error('Cenário parcial deve preservar um título falho.');
  const settledUuid = initialItems.data.items.find(item => item.status === 'SETTLED')?.receivable.uuid;
  expect(settledUuid).toBeDefined();

  currentQuote = { ...quoteFixture, uuid: demoUuid(777), rate: '6.000000000000', effectiveFrom: '2026-09-26T12:00:10Z', validUntil: '2026-09-27T12:00:10Z' };
  await expect(api.request(`/api/batches/${scenario.batch.uuid}/settlements`, { method: 'POST', statuses: [202], schema: requestSchema,
    idempotencyKey: 'partial-initial-01', body: { receivableUuids: [failed.receivable.uuid], reason: 'Revisar liquidação' } }))
    .rejects.toMatchObject({ status: 409, code: 'CHAVE_IDEMPOTENCIA_REUTILIZADA' });
  const reprocessed = await api.request(`/api/batches/${scenario.batch.uuid}/settlements`, { method: 'POST', statuses: [202],
    schema: requestSchema, idempotencyKey: 'partial-reprocess-01', body: { receivableUuids: [failed.receivable.uuid], reason: '  Revisar liquidação  ' } });
  expect(reprocessed.data).toMatchObject({ kind: 'REPROCESS', reason: 'Revisar liquidação', status: 'PENDING',
    snapshot: { exchangeRate: { uuid: demoUuid(777), rate: '6.000000000000' } }, counts: { pending: 1, settled: 0, failed: 0 } });
  const duringReprocess = await api.request(`/api/batches/${scenario.batch.uuid}`, { schema: batchDetailSchema });
  expect(duringReprocess.data).toMatchObject({ status: 'PENDING', counts: { pending: 1, settled: 9, failed: 0 },
    settledTotals: { faceValueBrl: '9000.00' }, progressVersion: '21' });
  expect(duringReprocess.data.activeRequest?.uuid).toBe(reprocessed.data.uuid);

  vi.setSystemTime(new Date(Date.parse(reprocessed.data.acceptedAt) + 5000));
  const completed = await api.request(`/api/batches/${scenario.batch.uuid}`, { schema: batchDetailSchema });
  expect(completed.data).toMatchObject({ status: 'SETTLED', counts: { pending: 0, settled: 10, failed: 0 },
    settledTotals: { faceValueBrl: '10000.00' }, progressVersion: '22', activeRequest: { kind: 'REPROCESS', status: 'SETTLED' } });

  const oldAttempt = await api.request(`/api/settlement-requests/${initial.data.uuid}/items`, { schema: requestItemPageSchema });
  expect(oldAttempt.data.items.find(item => item.uuid === failed.uuid)).toMatchObject({ status: 'FAILED', hasError: true,
    failure: { stage: 'PROCESSING', code: 'FALHA_DEMONSTRACAO' }, receivable: { processing: { status: 'SETTLED', hasError: false } } });
  const newAttempt = await api.request(`/api/settlement-requests/${reprocessed.data.uuid}/items`, { schema: requestItemPageSchema });
  expect(newAttempt.data.items).toHaveLength(1);
  expect(newAttempt.data.items[0]).toMatchObject({ status: 'SETTLED', attemptNumber: 2, previousAttemptUuid: failed.uuid,
    terms: { days: 0 }, result: { paymentValue: '1000.00' } });
  expect(newAttempt.data.items[0]?.receivable.uuid).toBe(failed.receivable.uuid);
  expect(initial.data.snapshot.exchangeRate?.rate).toBe('5.00');

  const history = await api.request(`/api/batches/${scenario.batch.uuid}/settlements`, { schema: requestPageSchema, query: { size: 50 } });
  expect(history.data.items.map(item => item.uuid)).toEqual([reprocessed.data.uuid, initial.data.uuid]);
  const audit = await api.request(`/api/batches/${scenario.batch.uuid}/audit-events`, { schema: auditEventPageSchema, query: { size: 100 } });
  expect(audit.data.items).toContainEqual(expect.objectContaining({ eventType: 'SETTLEMENT_REPROCESS_REQUESTED',
    details: { receivableUuids: [failed.receivable.uuid], reason: 'Revisar liquidação' } }));
  expect(audit.data.items).toContainEqual(expect.objectContaining({ eventType: 'RECEIVABLE_ATTEMPT_ACCEPTED', receivableUuid: failed.receivable.uuid,
    details: expect.objectContaining({ attemptNumber: 2, previousAttemptUuid: failed.uuid }) }));
  expect(ledger).toHaveLength(10);
  expect(new Set(ledger.map(item => item.receivableUuid)).size).toBe(10);
  const statement = await api.request('/api/settlements/items', { schema: statementPageSchema });
  expect(statement.data.totalItems).toBe(10);
  const dashboard = await api.request('/api/dashboard', { schema: dashboardSchema });
  expect(dashboard.data.batchCounts).toMatchObject({ SETTLED: 1 });
  expect(dashboard.data.totals).toMatchObject({ faceValueBrl: '10000.00', paymentBrl: '10000.00' });
  const repeated = await api.request(`/api/batches/${scenario.batch.uuid}/settlements`, { method: 'POST', statuses: [200, 202], schema: requestSchema,
    idempotencyKey: 'partial-reprocess-01', body: { receivableUuids: [failed.receivable.uuid], reason: 'Revisar liquidação' } });
  expect(repeated.status).toBe(200);
  expect(repeated.data.uuid).toBe(reprocessed.data.uuid);
  expect(ledger).toHaveLength(10);
});

test('idempotência global compara intenção normalizada e não duplica tentativas', async () => {
  const first = createTenTitleBatch(); const second = createTenTitleBatch();
  second.batch.uuid = demoUuid(88);
  const batches = [first, second];
  server.use(...createSettlementHandlers(batches, 'FAILED', () => quoteFixture, []));

  const initial = await api.request(`/api/batches/${first.batch.uuid}/settlements`, { method: 'POST', statuses: [202],
    schema: requestSchema, idempotencyKey: 'idempotency-initial-01' });
  vi.setSystemTime(new Date(Date.parse(initial.data.acceptedAt) + 5000));
  await api.request(`/api/batches/${first.batch.uuid}`, { schema: batchDetailSchema });
  const failedItems = await api.request(`/api/settlement-requests/${initial.data.uuid}/items`, { schema: requestItemPageSchema });
  const selected = failedItems.data.items.slice(0, 2).map(item => item.receivable.uuid);

  const accepted = await api.request(`/api/batches/${first.batch.uuid}/settlements`, { method: 'POST', statuses: [202], schema: requestSchema,
    idempotencyKey: 'same-global-key', body: { receivableUuids: selected, reason: '  Nova análise  ' } });
  const repeated = await api.request(`/api/batches/${first.batch.uuid}/settlements`, { method: 'POST', statuses: [200, 202], schema: requestSchema,
    idempotencyKey: 'same-global-key', body: { receivableUuids: [...selected].reverse(), reason: 'Nova análise' } });
  expect(repeated.data.uuid).toBe(accepted.data.uuid);
  expect(repeated.data.counts.pending).toBe(2);

  await expect(api.request(`/api/batches/${first.batch.uuid}/settlements`, { method: 'POST', statuses: [202], schema: requestSchema,
    idempotencyKey: 'same-global-key', body: { receivableUuids: selected, reason: 'Outro motivo' } }))
    .rejects.toMatchObject({ status: 409, code: 'CHAVE_IDEMPOTENCIA_REUTILIZADA' });
  await expect(api.request(`/api/batches/${first.batch.uuid}/settlements`, { method: 'POST', statuses: [202], schema: requestSchema,
    idempotencyKey: 'same-global-key', body: { receivableUuids: [selected[0], failedItems.data.items[2]!.receivable.uuid], reason: 'Nova análise' } }))
    .rejects.toMatchObject({ status: 409, code: 'CHAVE_IDEMPOTENCIA_REUTILIZADA' });
  await expect(api.request(`/api/batches/${second.batch.uuid}/settlements`, { method: 'POST', statuses: [202], schema: requestSchema,
    idempotencyKey: 'same-global-key', body: { receivableUuids: selected, reason: 'Nova análise' } }))
    .rejects.toMatchObject({ status: 409, code: 'CHAVE_IDEMPOTENCIA_REUTILIZADA' });
  await expect(api.request(`/api/batches/${first.batch.uuid}/settlements`, { method: 'POST', statuses: [202], schema: requestSchema,
    idempotencyKey: 'different-intent', body: { receivableUuids: [selected[0], selected[0]], reason: 'Nova análise' } }))
    .rejects.toMatchObject({ status: 400, code: 'REQUISICAO_INVALIDA' });
  await expect(api.request(`/api/batches/${first.batch.uuid}/settlements`, { method: 'POST', statuses: [202], schema: requestSchema,
    idempotencyKey: 'while-pending', body: { receivableUuids: selected, reason: 'Nova análise' } }))
    .rejects.toMatchObject({ status: 409, code: 'LOTE_EM_PROCESSAMENTO' });

  const reprocessItems = await api.request(`/api/settlement-requests/${accepted.data.uuid}/items`, { schema: requestItemPageSchema });
  expect(reprocessItems.data.items).toHaveLength(2);
  expect(reprocessItems.data.items.every(item => item.attemptNumber === 2)).toBe(true);
  const history = await api.request(`/api/batches/${first.batch.uuid}/settlements`, { schema: requestPageSchema, query: { size: 50 } });
  expect(history.data.items).toHaveLength(2);
});

test('rejeita a seleção inteira se contiver título liquidado, título externo ou repetição', async () => {
  const scenario = createTenTitleBatch(); const batches = [scenario];
  server.use(...createSettlementHandlers(batches, 'PARTIAL', () => quoteFixture, []));
  const initial = await api.request(`/api/batches/${scenario.batch.uuid}/settlements`, { method: 'POST', statuses: [202],
    schema: requestSchema, idempotencyKey: 'validation-initial' });
  vi.setSystemTime(new Date(Date.parse(initial.data.acceptedAt) + 10000));
  await api.request(`/api/batches/${scenario.batch.uuid}`, { schema: batchDetailSchema });
  const attempts = await api.request(`/api/settlement-requests/${initial.data.uuid}/items`, { schema: requestItemPageSchema });
  const failed = attempts.data.items.find(item => item.status === 'FAILED')!;
  const settled = attempts.data.items.find(item => item.status === 'SETTLED')!;

  const invalidSelections = [
    { key: 'mixed-outcome', receivableUuids: [failed.receivable.uuid, settled.receivable.uuid] },
    { key: 'outside-batch', receivableUuids: [failed.receivable.uuid, demoUuid(999)] },
  ];
  for (const selection of invalidSelections) {
    await expect(api.request(`/api/batches/${scenario.batch.uuid}/settlements`, { method: 'POST', statuses: [202], schema: requestSchema,
      idempotencyKey: selection.key, body: { receivableUuids: selection.receivableUuids, reason: 'Revisar' } }))
      .rejects.toMatchObject({ status: 409, code: 'TITULO_NAO_REPROCESSAVEL' });
  }
  await expect(api.request(`/api/batches/${scenario.batch.uuid}/settlements`, { method: 'POST', statuses: [202], schema: requestSchema,
    idempotencyKey: 'duplicate-selection', body: { receivableUuids: [failed.receivable.uuid, failed.receivable.uuid], reason: 'Revisar' } }))
    .rejects.toMatchObject({ status: 400, code: 'REQUISICAO_INVALIDA' });
  await expect(api.request(`/api/batches/${scenario.batch.uuid}/settlements`, { method: 'POST', statuses: [202], schema: requestSchema,
    idempotencyKey: 'blank-reason', body: { receivableUuids: [failed.receivable.uuid], reason: '   ' } }))
    .rejects.toMatchObject({ status: 400, code: 'REQUISICAO_INVALIDA' });

  const history = await api.request(`/api/batches/${scenario.batch.uuid}/settlements`, { schema: requestPageSchema, query: { size: 50 } });
  expect(history.data.items).toHaveLength(1);
  const unchanged = await api.request(`/api/batches/${scenario.batch.uuid}`, { schema: batchDetailSchema });
  expect(unchanged.data).toMatchObject({ status: 'PARTIALLY_SETTLED', counts: { settled: 9, failed: 1 } });
  const finalAttempts = await api.request(`/api/settlement-requests/${initial.data.uuid}/items`, { schema: requestItemPageSchema });
  expect(finalAttempts.data.items).toHaveLength(10);
});
