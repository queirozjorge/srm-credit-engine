import type { QueryClient } from '@tanstack/react-query';
import type { BatchDetail } from '../../batch/services/contracts';
import type { SettlementRequest } from './contracts';

function toCents(value: string) {
  const negative = value.startsWith('-');
  const [whole = '0', fraction = '00'] = (negative ? value.slice(1) : value).split('.');
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  return negative ? -cents : cents;
}

function fromCents(value: bigint) {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / 100n;
  const fraction = String(absolute % 100n).padStart(2, '0');
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

function combineMoney(base: string, added: string, removed = '0.00') {
  return fromCents(toCents(base) + toCents(added) - toCents(removed));
}

function requestSize(request: SettlementRequest) {
  const { pending, settled, failed } = request.counts;
  return pending + settled + failed;
}

function aggregateStatus(batch: BatchDetail, counts: BatchDetail['counts']): BatchDetail['status'] | null {
  if (counts.ready + counts.pending + counts.settled + counts.failed !== batch.itemCount) return null;
  if (counts.ready !== 0) return null;
  if (counts.pending > 0) return 'PENDING';
  if (counts.settled === batch.itemCount) return 'SETTLED';
  if (counts.settled > 0 && counts.failed > 0) return 'PARTIALLY_SETTLED';
  if (counts.failed === batch.itemCount) return 'FAILED';
  return null;
}

function isBehind(candidate: SettlementRequest, current: SettlementRequest) {
  const candidateTerminal = candidate.counts.settled + candidate.counts.failed;
  const currentTerminal = current.counts.settled + current.counts.failed;
  return candidateTerminal < currentTerminal;
}

function applyReprocessRequest(batch: BatchDetail, request: SettlementRequest, previousKnownRequest?: SettlementRequest): BatchDetail | null {
  const activeRequest = batch.activeRequest?.uuid === request.uuid ? batch.activeRequest : null;
  if (previousKnownRequest?.uuid === request.uuid && !activeRequest) return batch;
  const previousRequest = activeRequest ?? (previousKnownRequest?.uuid === request.uuid ? previousKnownRequest : null);
  let counts: BatchDetail['counts'];
  let settledTotals: BatchDetail['settledTotals'];

  if (previousRequest) {
    // The cache already contains this request's earlier state. Apply only its progress delta.
    counts = {
      ready: batch.counts.ready,
      pending: batch.counts.pending + request.counts.pending - previousRequest.counts.pending,
      settled: batch.counts.settled + request.counts.settled - previousRequest.counts.settled,
      failed: batch.counts.failed + request.counts.failed - previousRequest.counts.failed,
    };
    settledTotals = {
      faceValueBrl: combineMoney(batch.settledTotals.faceValueBrl, request.settledTotals.faceValueBrl, previousRequest.settledTotals.faceValueBrl),
      presentValueBrl: combineMoney(batch.settledTotals.presentValueBrl, request.settledTotals.presentValueBrl, previousRequest.settledTotals.presentValueBrl),
      discountBrl: combineMoney(batch.settledTotals.discountBrl, request.settledTotals.discountBrl, previousRequest.settledTotals.discountBrl),
      paymentBrl: combineMoney(batch.settledTotals.paymentBrl, request.settledTotals.paymentBrl, previousRequest.settledTotals.paymentBrl),
      paymentUsd: combineMoney(batch.settledTotals.paymentUsd, request.settledTotals.paymentUsd, previousRequest.settledTotals.paymentUsd),
    };
  } else {
    const selectedCount = requestSize(request);
    // A new manual request may only replace titles that were failed in the batch aggregate.
    if (selectedCount === 0 || batch.counts.failed < selectedCount) return null;
    counts = {
      ready: batch.counts.ready,
      pending: batch.counts.pending + request.counts.pending,
      settled: batch.counts.settled + request.counts.settled,
      failed: batch.counts.failed - selectedCount + request.counts.failed,
    };
    settledTotals = {
      faceValueBrl: combineMoney(batch.settledTotals.faceValueBrl, request.settledTotals.faceValueBrl),
      presentValueBrl: combineMoney(batch.settledTotals.presentValueBrl, request.settledTotals.presentValueBrl),
      discountBrl: combineMoney(batch.settledTotals.discountBrl, request.settledTotals.discountBrl),
      paymentBrl: combineMoney(batch.settledTotals.paymentBrl, request.settledTotals.paymentBrl),
      paymentUsd: combineMoney(batch.settledTotals.paymentUsd, request.settledTotals.paymentUsd),
    };
  }

  if (Object.values(counts).some(value => value < 0)) return null;
  const status = aggregateStatus(batch, counts);
  if (!status) return null;
  return { ...batch, status, counts, settledTotals, activeRequest: request };
}

export function acceptRequest(cache: QueryClient, request: SettlementRequest, expectedRequest?: string) {
  const key = ['batches', 'detail', request.batchUuid];
  const current = cache.getQueryData<BatchDetail>(key);
  if (expectedRequest && current?.activeRequest?.uuid !== expectedRequest) return;
  let effectiveRequest = request;
  if (current) {
    const knownRequest = cache.getQueryData<SettlementRequest>(['settlement', 'request', request.uuid]);
    const activeRequest = current.activeRequest?.uuid === request.uuid ? current.activeRequest : null;
    if (activeRequest && request.kind === 'REPROCESS' && isBehind(request, activeRequest)) {
      effectiveRequest = activeRequest;
    } else {
      const previousKnownRequest = activeRequest ?? knownRequest;
      const next = request.kind === 'INITIAL'
        ? { ...current, status: request.status, counts: request.counts, settledTotals: request.settledTotals, activeRequest: request }
        : applyReprocessRequest(current, request, previousKnownRequest);
      if (next) cache.setQueryData(key, next);
      else void cache.invalidateQueries({ queryKey: key });
    }
  }
  void cache.invalidateQueries({ queryKey: ['batches', 'items', request.batchUuid], refetchType: 'none' });
  void cache.invalidateQueries({ queryKey: ['batches', 'list'], refetchType: 'none' });
  cache.setQueryData(['settlement', 'request', request.uuid], effectiveRequest);
}
