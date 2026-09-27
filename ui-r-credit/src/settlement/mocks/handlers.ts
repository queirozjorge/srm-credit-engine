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
import type { AuditEvent, SettlementRequest } from '../services/contracts';
import { reprocessRequestSchema } from '../services/reprocessContracts';

type Outcome = 'SETTLED' | 'FAILED' | 'PARTIAL';
type Attempt = {
  uuid: string; requestUuid: string; receivable: Scenario['items'][number]; attemptNumber: number; previousAttemptUuid: string | null;
  status: 'PENDING' | 'SETTLED' | 'FAILED'; hasError: boolean; retryCount: number; nextRetryAt: string | null;
  terms: { days: number; termMonths: string; spread: string } | null; completedAt: string | null;
  failure: { code: string; message: string; stage: 'ACCEPTANCE' | 'PROCESSING'; occurredAt: string } | null;
  result: { uuid: string; settledAt: string; presentValueBrl: string; discountBrl: string; paymentCurrency: 'BRL' | 'USD'; paymentValue: string } | null;
};

const cents = (value: string) => BigInt(value.replace('.', ''));
function decimal(value: bigint) {
  const sign = value < 0n ? '-' : ''; const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}
function sumMoney(values: string[]) { return decimal(values.reduce((sum, value) => sum + cents(value), 0n)); }
function totalsFor(attempts: Attempt[]) {
  const settled = attempts.filter(attempt => attempt.status === 'SETTLED' && attempt.result);
  return {
    faceValueBrl: sumMoney(settled.map(attempt => attempt.receivable.faceValueBrl)),
    presentValueBrl: sumMoney(settled.map(attempt => attempt.result!.presentValueBrl)),
    discountBrl: sumMoney(settled.map(attempt => attempt.result!.discountBrl)),
    paymentBrl: sumMoney(settled.filter(attempt => attempt.result!.paymentCurrency === 'BRL').map(attempt => attempt.result!.paymentValue)),
    paymentUsd: sumMoney(settled.filter(attempt => attempt.result!.paymentCurrency === 'USD').map(attempt => attempt.result!.paymentValue)),
  };
}

export function createSettlementHandlers(batches: Scenario[] = createBatchStore(), outcome: Outcome = 'SETTLED', quote: () => z.infer<typeof quoteSchema> | null = () => requestFixture.snapshot.exchangeRate, ledger: LedgerItem[] = []) {
  const requests = new Map<string, SettlementRequest>(); const keys = new Map<string, { fingerprint: string; requestUuid: string }>();
  const attempts = new Map<string, Attempt[]>();
  const auditEvents = new Map<string, AuditEvent[]>();

  function eventsForBatch(batch: Scenario) {
    let events = auditEvents.get(batch.batch.uuid);
    if (!events) {
      events = [{ uuid: crypto.randomUUID(), batchUuid: batch.batch.uuid, receivableUuid: null, requestUuid: null, attemptUuid: null,
        eventType: 'BATCH_CREATED', actor: batch.batch.createdBy, registeredAt: batch.batch.registeredAt,
        correlationId: `demo-${batch.batch.uuid}`, details: { source: batch.batch.source, itemCount: batch.batch.itemCount } }];
      auditEvents.set(batch.batch.uuid, events);
    }
    return events;
  }

  function recordAudit(batch: Scenario, event: AuditEvent) { eventsForBatch(batch).push(event); }
  batches.forEach(eventsForBatch);

  function currentCounts(batch: Scenario) {
    return batch.items.reduce((counts, item) => { counts[item.processing.status.toLowerCase() as 'ready' | 'pending' | 'settled' | 'failed']++; return counts; },
      { ready: 0, pending: 0, settled: 0, failed: 0 });
  }
  function aggregateBatch(batch: Scenario, request: SettlementRequest, changedCount: number) {
    const counts = currentCounts(batch);
    batch.batch.counts = counts;
    batch.batch.status = counts.pending > 0 ? 'PENDING' : counts.settled === batch.items.length ? 'SETTLED'
      : counts.settled > 0 ? 'PARTIALLY_SETTLED' : counts.failed === batch.items.length ? 'FAILED' : 'READY';
    batch.batch.activeRequest = request;
    batch.batch.settledTotals = totalsFor([...attempts.values()].flat().filter(attempt =>
      attempt.status === 'SETTLED' && attempt.receivable.processing.status === 'SETTLED'
      && attempt.receivable.processing.activeRequestUuid === attempt.requestUuid
      && attempt.receivable.processing.attemptNumber === attempt.attemptNumber));
    batch.batch.progressVersion = String(BigInt(batch.batch.progressVersion) + BigInt(changedCount));
  }
  function recordSuccess(attempt: Attempt, settledAt: string, batchUuid: string) {
    const template = simulationFixture.items[0]!;
    attempt.status = 'SETTLED'; attempt.hasError = false; attempt.completedAt = settledAt; attempt.nextRetryAt = null;
    attempt.failure = null;
    attempt.result = { uuid: crypto.randomUUID(), settledAt, presentValueBrl: template.presentValueBrl, discountBrl: template.discountBrl,
      paymentCurrency: template.paymentCurrency, paymentValue: template.paymentValue };
    attempt.receivable.processing = { ...attempt.receivable.processing, status: 'SETTLED', hasError: false, failure: null,
      settlementUuid: attempt.result.uuid, activeRequestUuid: attempt.requestUuid, attemptNumber: attempt.attemptNumber };
    ledger.push({ uuid: attempt.result.uuid, settlementUuid: attempt.result.uuid, batchUuid,
      requestUuid: attempt.requestUuid, settledAt, receivableUuid: attempt.receivable.uuid, assignorUuid: attempt.receivable.assignorUuid,
      assignorName: attempt.receivable.assignorName, externalReference: attempt.receivable.externalReference, paymentCurrency: attempt.result.paymentCurrency,
      faceValueBrl: attempt.receivable.faceValueBrl, presentValueBrl: attempt.result.presentValueBrl, paymentValue: attempt.result.paymentValue });
    const batch = batches.find(value => value.batch.uuid === batchUuid); const request = requests.get(attempt.requestUuid);
    if (batch && request) recordAudit(batch, { uuid: crypto.randomUUID(), batchUuid, receivableUuid: attempt.receivable.uuid,
      requestUuid: attempt.requestUuid, attemptUuid: attempt.uuid, eventType: 'RECEIVABLE_SETTLED', actor: request.requestedBy,
      registeredAt: settledAt, correlationId: `demo-${batchUuid}`, details: { settlementUuid: attempt.result.uuid } });
  }
  function recordFailure(attempt: Attempt, failedAt: string) {
    attempt.status = 'FAILED'; attempt.hasError = true; attempt.completedAt = failedAt; attempt.nextRetryAt = null; attempt.result = null;
    attempt.failure = { code: 'FALHA_DEMONSTRACAO', message: demoText.invalid, stage: 'PROCESSING', occurredAt: failedAt };
    attempt.receivable.processing = { ...attempt.receivable.processing, status: 'FAILED', hasError: true, failure: attempt.failure,
      settlementUuid: null, activeRequestUuid: attempt.requestUuid, attemptNumber: attempt.attemptNumber };
    const batch = batches.find(value => value.items.some(item => item.uuid === attempt.receivable.uuid)); const request = requests.get(attempt.requestUuid);
    if (batch && request) recordAudit(batch, { uuid: crypto.randomUUID(), batchUuid: batch.batch.uuid, receivableUuid: attempt.receivable.uuid,
      requestUuid: attempt.requestUuid, attemptUuid: attempt.uuid, eventType: 'RECEIVABLE_SETTLEMENT_FAILED', actor: request.requestedBy,
      registeredAt: failedAt, correlationId: `demo-${batch.batch.uuid}`, details: { retryCount: attempt.retryCount, failure: attempt.failure } });
  }
  function refreshRequest(row: SettlementRequest, changedCount: number): SettlementRequest {
    const batch = batches.find(value => value.batch.uuid === row.batchUuid);
    const requestAttempts = attempts.get(row.uuid) ?? [];
    if (!batch || changedCount === 0) return row;
    const counts = requestAttempts.reduce((result, attempt) => { result[attempt.status.toLowerCase() as 'pending' | 'settled' | 'failed']++; return result; },
      { ready: 0, pending: 0, settled: 0, failed: 0 });
    const status = counts.pending > 0 ? 'PENDING' : counts.settled === 0 ? 'FAILED'
      : counts.failed === 0 ? 'SETTLED' : 'PARTIALLY_SETTLED';
    const next: SettlementRequest = status === 'PENDING'
      ? { ...row, status, completedAt: null, counts, settledTotals: totalsFor(requestAttempts) }
      : { ...row, status, completedAt: new Date().toISOString(), counts, settledTotals: totalsFor(requestAttempts) };
    requests.set(row.uuid, next);
    aggregateBatch(batch, next, changedCount);
    return next;
  }
  function complete(row: SettlementRequest): SettlementRequest {
    const elapsed = Date.now() - Date.parse(row.acceptedAt);
    const requestAttempts = attempts.get(row.uuid) ?? [];
    if (row.status !== 'PENDING' || requestAttempts.length === 0 || elapsed < 5000) return row;
    const pendingAttempts = requestAttempts.filter(attempt => attempt.status === 'PENDING');
    const toSettle = outcome === 'SETTLED' || (row.kind === 'REPROCESS' && outcome === 'PARTIAL') ? pendingAttempts
      : outcome === 'PARTIAL' ? pendingAttempts.slice(0, -1) : [];
    const settledAt = new Date().toISOString();
    const batchUuid = row.batchUuid;
    toSettle.forEach(attempt => recordSuccess(attempt, settledAt, batchUuid));
    let next = toSettle.length ? refreshRequest(row, toSettle.length) : row;
    if (elapsed < (outcome === 'PARTIAL' ? 10000 : 5000) || next.status !== 'PENDING') return next;
    const toFail = outcome === 'FAILED' || outcome === 'PARTIAL' ? requestAttempts.filter(attempt => attempt.status === 'PENDING') : [];
    const failedAt = new Date().toISOString();
    toFail.forEach(attempt => recordFailure(attempt, failedAt));
    next = toFail.length ? refreshRequest(next, toFail.length) : next;
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
      if (!key?.trim()) return failure(400, 'REQUISICAO_INVALIDA');

      let rawBody: string;
      try { rawBody = await request.clone().text(); } catch { return failure(400, 'REQUISICAO_INVALIDA'); }
      let kind: SettlementRequest['kind'];
      let reason: string | null = null;
      let selectedUuids: string[];
      if (rawBody === '') {
        kind = 'INITIAL';
        selectedUuids = batch.items.map(item => item.uuid.toLowerCase()).sort();
      } else {
        let payload: unknown;
        try { payload = JSON.parse(rawBody) as unknown; } catch { return failure(400, 'REQUISICAO_INVALIDA'); }
        if (typeof payload !== 'object' || payload === null || Array.isArray(payload)
          || Object.keys(payload).sort().join(',') !== 'reason,receivableUuids') return failure(400, 'REQUISICAO_INVALIDA');
        const parsed = reprocessRequestSchema.safeParse(payload);
        if (!parsed.success) return failure(400, 'REQUISICAO_INVALIDA');
        kind = 'REPROCESS';
        reason = parsed.data.reason;
        selectedUuids = [...parsed.data.receivableUuids];
      }

      const fingerprint = JSON.stringify({ batchUuid: batch.batch.uuid.toLowerCase(), kind, receivableUuids: selectedUuids, reason });
      const previous = keys.get(key);
      if (previous) {
        if (previous.fingerprint !== fingerprint) return failure(409, 'CHAVE_IDEMPOTENCIA_REUTILIZADA');
        const existing = requests.get(previous.requestUuid);
        if (!existing) return failure(500, 'ERRO_INTERNO');
        const refreshed = complete(existing);
        return HttpResponse.json(refreshed, { status: refreshed.status === 'PENDING' ? 202 : 200,
          headers: { Location: refreshed.statusUrl } });
      }

      if (batch.batch.activeRequest?.status === 'PENDING') {
        complete(requests.get(batch.batch.activeRequest.uuid) ?? batch.batch.activeRequest);
      }
      if (batch.batch.status === 'PENDING') return failure(409, 'LOTE_EM_PROCESSAMENTO');

      let selectedItems: Scenario['items'];
      if (kind === 'INITIAL') {
        if (batch.batch.status === 'SETTLED' && batch.batch.activeRequest) {
          return HttpResponse.json(batch.batch.activeRequest, { status: 200, headers: { Location: batch.batch.activeRequest.statusUrl } });
        }
        if (batch.batch.status === 'FAILED' || batch.batch.status === 'PARTIALLY_SETTLED') return failure(409, 'REPROCESSAMENTO_EXIGE_SELECAO');
        selectedItems = [...batch.items].sort((a, b) => a.uuid.localeCompare(b.uuid));
        if (selectedItems.some(item => item.processing.status !== 'READY')) return failure(409, 'LOTE_EM_PROCESSAMENTO');
      } else {
        const byUuid = new Map(batch.items.map(item => [item.uuid.toLowerCase(), item]));
        selectedItems = selectedUuids.map(uuid => byUuid.get(uuid)).filter((item): item is Scenario['items'][number] => item !== undefined);
        if (selectedItems.length !== selectedUuids.length || selectedItems.some(item => item.processing.status !== 'FAILED')) {
          return failure(409, 'TITULO_NAO_REPROCESSAVEL');
        }
      }
      if (!supportedSimulation(selectedItems)) return failure(422, 'DADOS_INVALIDOS');

      const uuid = crypto.randomUUID(); const acceptedAt = new Date().toISOString();
      const actor = Object.values(demoProfiles).find(row => row.subject === request.headers.get('X-Demo-Subject'))!;
      const row: SettlementRequest = { ...requestFixture, kind, reason,
        snapshot: { ...requestFixture.snapshot, calculationDate: acceptedAt.slice(0, 10), exchangeRate: quote() }, uuid, batchUuid: batch.batch.uuid,
        statusUrl: `/api/settlement-requests/${uuid}`, acceptedAt, requestedBy: actor,
        counts: { ready: 0, pending: selectedItems.length, settled: 0, failed: 0 } };
      const calculation = simulationFixture.items[0]!;
      const rows: Attempt[] = selectedItems.map(receivable => {
        const priorAttempt = [...attempts.values()].flat().filter(attempt => attempt.receivable.uuid === receivable.uuid)
          .sort((left, right) => right.attemptNumber - left.attemptNumber)[0];
        const attemptNumber = receivable.processing.attemptNumber + 1;
        return { uuid: crypto.randomUUID(), requestUuid: uuid, receivable, attemptNumber,
          previousAttemptUuid: priorAttempt?.uuid ?? null, status: 'PENDING', hasError: false, retryCount: 0, nextRetryAt: null,
          terms: { days: calculation.days, termMonths: calculation.termMonths, spread: calculation.spread }, completedAt: null, failure: null, result: null };
      });
      requests.set(uuid, row); attempts.set(uuid, rows); keys.set(key, { fingerprint, requestUuid: uuid });
      const requestAudit = { uuid: crypto.randomUUID(), batchUuid: batch.batch.uuid, receivableUuid: null, requestUuid: uuid, attemptUuid: null,
        actor, registeredAt: row.acceptedAt, correlationId: `demo-${batch.batch.uuid}` };
      if (kind === 'INITIAL') recordAudit(batch, { ...requestAudit, eventType: 'SETTLEMENT_REQUESTED', details: { receivableUuids: selectedUuids } });
      else recordAudit(batch, { ...requestAudit, eventType: 'SETTLEMENT_REPROCESS_REQUESTED', details: { receivableUuids: selectedUuids, reason: reason! } });
      rows.forEach(attempt => recordAudit(batch, { uuid: crypto.randomUUID(), batchUuid: batch.batch.uuid, receivableUuid: attempt.receivable.uuid,
        requestUuid: uuid, attemptUuid: attempt.uuid, eventType: 'RECEIVABLE_ATTEMPT_ACCEPTED', actor, registeredAt: row.acceptedAt,
        correlationId: `demo-${batch.batch.uuid}`, details: { attemptNumber: attempt.attemptNumber, previousAttemptUuid: attempt.previousAttemptUuid,
          termDays: attempt.terms?.days ?? null, spread: attempt.terms?.spread ?? null } }));
      selectedItems.forEach(item => { const attempt = rows.find(value => value.receivable.uuid === item.uuid)!;
        item.processing = { ...item.processing, status: 'PENDING', hasError: false, failure: null,
          activeRequestUuid: uuid, attemptNumber: attempt.attemptNumber, settlementUuid: null }; });
      aggregateBatch(batch, row, selectedItems.length);
      return HttpResponse.json(row, { status: 202, headers: { Location: row.statusUrl } });
    }),
    http.get('/api/batches/:uuid/settlements', ({ request, params }) => authorize(request) ?? (batches.some(row => row.batch.uuid === params.uuid)
      ? paginated(request, [...requests.values()].filter(row => row.batchUuid === params.uuid).reverse()) : failure(404, 'RECURSO_NAO_ENCONTRADO', demoText.missing))),
    http.get('/api/batches/:uuid/audit-events', ({ request, params }) => {
      const denied = authorize(request); if (denied) return denied;
      const batch = batches.find(value => value.batch.uuid === params.uuid);
      if (!batch) return failure(404, 'RECURSO_NAO_ENCONTRADO', demoText.missing);
      const receivableUuid = new URL(request.url).searchParams.get('receivableUuid');
      const rows = eventsForBatch(batch).filter(event => !receivableUuid || event.receivableUuid === receivableUuid)
        .sort((left, right) => left.registeredAt.localeCompare(right.registeredAt) || left.uuid.localeCompare(right.uuid));
      return paginated(request, rows);
    }),
    ...createStatementHandlers(ledger),
    http.get('/api/settlement-requests/:uuid', ({ request, params }) => {
      const denied = authorize(request); if (denied) return denied;
      const row = requests.get(String(params.uuid)); return row ? HttpResponse.json(complete(row)) : failure(404, 'RECURSO_NAO_ENCONTRADO', demoText.missing);
    }),
    http.get('/api/settlement-requests/:uuid/items', ({ request, params }) => {
      const denied = authorize(request); if (denied) return denied;
      const row = requests.get(String(params.uuid)); if (!row) return failure(404, 'RECURSO_NAO_ENCONTRADO', demoText.missing);
      return paginated(request, [...(attempts.get(row.uuid) ?? [])].sort((a, b) => a.receivable.uuid.localeCompare(b.receivable.uuid)));
    }),
  ];
}
export const settlementHandlers = createSettlementHandlers();
