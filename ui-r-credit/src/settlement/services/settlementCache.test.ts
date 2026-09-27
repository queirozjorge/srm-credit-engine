import { expect, test } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { batchDetailSchema, type BatchDetail } from '../../batch/services/contracts';
import type { SettlementRequest } from './contracts';
import { acceptRequest } from './settlementCache';

const zeroTotals = { faceValueBrl: '0.00', presentValueBrl: '0.00', discountBrl: '0.00', paymentBrl: '0.00', paymentUsd: '0.00' };
const snapshot = { calculationDate: '2026-09-27', calculationVersion: 'demo-v1', dayCountConvention: 'ACTUAL_30' as const,
  baseRate: '0.1', exchangeRate: null };
const actor = { issuer: 'demo', subject: 'operator' };

function request(overrides: Partial<SettlementRequest> & Pick<SettlementRequest, 'uuid' | 'kind' | 'status' | 'counts' | 'settledTotals'>): SettlementRequest {
  const statusUrl = `/api/settlement-requests/${overrides.uuid}`;
  return {
    uuid: overrides.uuid, batchUuid: '00000000-0000-4000-8000-000000000010', kind: overrides.kind,
    reason: overrides.kind === 'REPROCESS' ? 'Nova tentativa' : null, status: overrides.status,
    statusUrl, acceptedAt: '2026-09-27T10:00:00Z', requestedBy: actor, snapshot,
    counts: overrides.counts, settledTotals: overrides.settledTotals,
    completedAt: overrides.status === 'PENDING' ? null : '2026-09-27T10:01:00Z',
  } as SettlementRequest;
}

const oldRequest = request({ uuid: '00000000-0000-4000-8000-000000000011', kind: 'INITIAL', status: 'PARTIALLY_SETTLED',
  counts: { ready: 0, pending: 0, settled: 2, failed: 1 },
  settledTotals: { faceValueBrl: '200.00', presentValueBrl: '190.00', discountBrl: '10.00', paymentBrl: '190.00', paymentUsd: '0.00' } });

function batch(activeRequest = oldRequest): BatchDetail {
  return { uuid: '00000000-0000-4000-8000-000000000010', source: 'FORM', status: 'PARTIALLY_SETTLED', itemCount: 3,
    assignorCount: 1, soleAssignor: { uuid: '00000000-0000-4000-8000-000000000020', name: 'Cedente' },
    faceValueBrl: '300.00', registeredAt: '2026-09-27T09:00:00Z', counts: { ready: 0, pending: 0, settled: 2, failed: 1 },
    createdBy: actor, activeRequest, settledTotals: oldRequest.settledTotals, progressVersion: '2' };
}

test('atualiza os agregados do lote ao aceitar e concluir um reprocessamento sem duplicar os totais', () => {
  const cache = new QueryClient();
  const key = ['batches', 'detail', '00000000-0000-4000-8000-000000000010'];
  cache.setQueryData(key, batch());

  const pending = request({ uuid: '00000000-0000-4000-8000-000000000012', kind: 'REPROCESS', status: 'PENDING',
    counts: { ready: 0, pending: 1, settled: 0, failed: 0 }, settledTotals: zeroTotals });
  acceptRequest(cache, pending);
  const pendingBatch = cache.getQueryData<BatchDetail>(key);
  expect(pendingBatch?.status).toBe('PENDING');
  expect(pendingBatch?.counts).toEqual({ ready: 0, pending: 1, settled: 2, failed: 0 });
  expect(batchDetailSchema.safeParse(pendingBatch).success).toBe(true);

  const settled = request({ uuid: pending.uuid, kind: 'REPROCESS', status: 'SETTLED',
    counts: { ready: 0, pending: 0, settled: 1, failed: 0 },
    settledTotals: { faceValueBrl: '100.00', presentValueBrl: '95.00', discountBrl: '5.00', paymentBrl: '95.00', paymentUsd: '0.00' } });
  acceptRequest(cache, settled);
  const settledBatch = cache.getQueryData<BatchDetail>(key);
  expect(settledBatch?.status).toBe('SETTLED');
  expect(settledBatch?.counts).toEqual({ ready: 0, pending: 0, settled: 3, failed: 0 });
  expect(settledBatch?.settledTotals).toEqual({ faceValueBrl: '300.00', presentValueBrl: '285.00', discountBrl: '15.00', paymentBrl: '285.00', paymentUsd: '0.00' });
  expect(batchDetailSchema.safeParse(settledBatch).success).toBe(true);
  cache.setQueryData(['settlement', 'request', settled.uuid], pending);
  acceptRequest(cache, pending);
  expect(cache.getQueryData<BatchDetail>(key)).toEqual(settledBatch);
  expect(cache.getQueryData<SettlementRequest>(['settlement', 'request', settled.uuid])?.status).toBe('SETTLED');
  expect(cache.getQueryData<BatchDetail>(key)?.settledTotals).toEqual(settledBatch?.settledTotals);
  cache.clear();
});

test('replay de tentativa histórica não altera o lote nem substitui a solicitação mais recente', () => {
  const cache = new QueryClient();
  const key = ['batches', 'detail', '00000000-0000-4000-8000-000000000010'];
  const initial = request({ uuid: '00000000-0000-4000-8000-000000000013', kind: 'INITIAL', status: 'PARTIALLY_SETTLED',
    counts: { ready: 0, pending: 0, settled: 2, failed: 2 },
    settledTotals: { faceValueBrl: '200.00', presentValueBrl: '190.00', discountBrl: '10.00', paymentBrl: '190.00', paymentUsd: '0.00' } });
  const fourItems = { ...batch(initial), itemCount: 4, faceValueBrl: '400.00', counts: { ready: 0, pending: 0, settled: 2, failed: 2 } };
  cache.setQueryData(key, fourItems);

  const first = request({ uuid: '00000000-0000-4000-8000-000000000014', kind: 'REPROCESS', status: 'SETTLED',
    counts: { ready: 0, pending: 0, settled: 1, failed: 0 },
    settledTotals: { faceValueBrl: '100.00', presentValueBrl: '95.00', discountBrl: '5.00', paymentBrl: '95.00', paymentUsd: '0.00' } });
  acceptRequest(cache, first);
  const second = request({ uuid: '00000000-0000-4000-8000-000000000015', kind: 'REPROCESS', status: 'FAILED',
    counts: { ready: 0, pending: 0, settled: 0, failed: 1 }, settledTotals: zeroTotals });
  acceptRequest(cache, second);
  const beforeReplay = cache.getQueryData<BatchDetail>(key);
  acceptRequest(cache, first);
  const afterReplay = cache.getQueryData<BatchDetail>(key);

  expect(afterReplay).toEqual(beforeReplay);
  expect(afterReplay?.activeRequest?.uuid).toBe(second.uuid);
  expect(afterReplay?.counts).toEqual({ ready: 0, pending: 0, settled: 3, failed: 1 });
  expect(afterReplay?.settledTotals.faceValueBrl).toBe('300.00');
  expect(batchDetailSchema.safeParse(afterReplay).success).toBe(true);
  cache.clear();
});
