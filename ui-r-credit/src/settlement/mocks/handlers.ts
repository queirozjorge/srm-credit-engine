import { createStatementHandlers, type LedgerItem } from './statementHandlers';
import type { quoteSchema } from '../../exchange/services/contracts';
import type { z } from 'zod';
import { http, HttpResponse } from 'msw';
import { authorize, paginated, failure, demoText } from '../../common/testing/demo';
import { createBatchStore, type Scenario } from '../../batch/mocks/handlers';
import { supportedSimulation } from '../../pricing/mocks/handlers';
import { simulationFixture } from '../../pricing/mocks/fixtures';
import { demoProfiles } from '../../auth/mocks/profiles';
import { requestFixture } from './fixtures';
import type { SettlementRequest } from '../services/contracts';
export function createSettlementHandlers(batches: Scenario[] = createBatchStore(), outcome: 'SETTLED' | 'FAILED' = 'SETTLED', quote: () => z.infer<typeof quoteSchema> | null = () => requestFixture.snapshot.exchangeRate, ledger: LedgerItem[] = []) {
  const requests = new Map<string, SettlementRequest>(); const keys = new Map<string, string>();
  function complete(row: SettlementRequest): SettlementRequest {
    if (row.status !== 'PENDING' || Date.now() - Date.parse(row.acceptedAt) < 5000) return row;
    const completedAt = new Date().toISOString();
    const next: SettlementRequest = outcome === 'SETTLED'
      ? { ...row, status: 'SETTLED', completedAt, result: { uuid: crypto.randomUUID(), settledAt: completedAt, totals: simulationFixture.totals }, failure: null }
      : { ...row, status: 'FAILED', completedAt, result: null, failure: { code: 'FALHA_DEMONSTRACAO', message: demoText.invalid } };
    requests.set(row.uuid, next);
    const batch = batches.find(value => value.batch.uuid === row.batchUuid);
    if (batch?.batch.activeRequest?.uuid === row.uuid) { batch.batch.activeRequest = next; batch.batch.status = next.status; }
    if (next.status === 'SETTLED' && batch) ledger.push(...batch.items.map(item => ({ uuid: crypto.randomUUID(), batchUuid: batch.batch.uuid,
      requestUuid: next.uuid, settlementUuid: next.result.uuid, settledAt: next.result.settledAt, receivableUuid: item.uuid, assignorUuid: item.assignorUuid,
      assignorName: item.assignorName, externalReference: item.externalReference, paymentCurrency: item.paymentCurrency,
      faceValueBrl: item.faceValueBrl, presentValueBrl: simulationFixture.items[0]!.presentValueBrl, paymentValue: simulationFixture.items[0]!.paymentValue })));
    return next;
  }
  return [
    http.get('/api/batches/:uuid', ({ request, params }) => {
      const denied = authorize(request); if (denied) return denied;
      const batch = batches.find(row => row.batch.uuid === params.uuid);
      if (!batch) return failure(404, 'RECURSO_NAO_ENCONTRADO', demoText.missing);
      const active = batch.batch.activeRequest;
      if (active) complete(requests.get(active.uuid) ?? active);
      return HttpResponse.json(batch.batch);
    }),
    http.post('/api/batches/:uuid/settlements', async ({ request, params }) => {
      const denied = authorize(request, 'settle'); if (denied) return denied;
      const batch = batches.find(row => row.batch.uuid === params.uuid);
      if (!batch) return failure(404, 'RECURSO_NAO_ENCONTRADO', demoText.missing);
      const key = request.headers.get('Idempotency-Key');
      if (!key || await request.text()) return failure(400, 'REQUISICAO_INVALIDA');
      const previous = keys.get(key); const existing = previous ? requests.get(previous) : undefined;
      if (existing) return existing.batchUuid === batch.batch.uuid
        ? HttpResponse.json(complete(existing), { status: 200, headers: { Location: existing.statusUrl } }) : failure(409, 'CHAVE_REUTILIZADA');
      if (batch.batch.status === 'PENDING') return failure(409, 'OPERACAO_EM_ANDAMENTO');
      if (batch.batch.status === 'SETTLED' && batch.batch.activeRequest) return HttpResponse.json(batch.batch.activeRequest);
      if (!supportedSimulation(batch.items)) return failure(422, 'DADOS_INVALIDOS');
      const uuid = crypto.randomUUID(); const actor = Object.values(demoProfiles).find(row => row.subject === request.headers.get('X-Demo-Subject'))!;
      const row: SettlementRequest = { ...requestFixture, snapshot: { ...requestFixture.snapshot, exchangeRate: quote() }, uuid, batchUuid: batch.batch.uuid, statusUrl: `/api/settlement-requests/${uuid}`, acceptedAt: new Date().toISOString(), requestedBy: actor };
      requests.set(uuid, row); keys.set(key, uuid); batch.batch.status = 'PENDING'; batch.batch.activeRequest = row;
      return HttpResponse.json(row, { status: 202, headers: { Location: row.statusUrl } });
    }),
    http.get('/api/batches/:uuid/settlements', ({ request, params }) => authorize(request) ?? (batches.some(row => row.batch.uuid === params.uuid)
      ? paginated(request, [...requests.values()].filter(row => row.batchUuid === params.uuid).reverse()) : failure(404, 'RECURSO_NAO_ENCONTRADO', demoText.missing))),
    ...createStatementHandlers(ledger),
    http.get('/api/settlement-requests/:uuid', ({ request, params }) => {
      const denied = authorize(request); if (denied) return denied;
      const row = requests.get(String(params.uuid)); return row ? HttpResponse.json(complete(row)) : failure(404, 'RECURSO_NAO_ENCONTRADO', demoText.missing);
    }),
    http.get('/api/settlement-requests/:uuid/items', ({ request, params }) => {
      const denied = authorize(request); if (denied) return denied;
      const row = requests.get(String(params.uuid)); if (!row) return failure(404, 'RECURSO_NAO_ENCONTRADO', demoText.missing);
      const item = simulationFixture.items[0]!;
      return paginated(request, batches.find(batch => batch.batch.uuid === row.batchUuid)!.items.map(receivable => ({ receivable,
        terms: { days: item.days, termMonths: item.termMonths, spread: item.spread }, result: row.status === 'SETTLED' ? item : null })));
    }),
  ];
}
export const settlementHandlers = createSettlementHandlers();
