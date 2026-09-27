import type { QueryClient } from '@tanstack/react-query';
import type { BatchDetail } from '../../batch/services/contracts';
import type { SettlementRequest } from './contracts';
export function acceptRequest(cache: QueryClient, request: SettlementRequest, expectedRequest?: string) {
  const key = ['batches', 'detail', request.batchUuid];
  const current = cache.getQueryData<BatchDetail>(key);
  if (expectedRequest && current?.activeRequest?.uuid !== expectedRequest) return;
  cache.setQueryData(key, current ? { ...current, status: request.status, activeRequest: request } : current);
  cache.setQueriesData<{ items: { uuid: string; status: string }[] }>({ queryKey: ['batches', 'list'] }, old => old ? { ...old, items: old.items.map(row => row.uuid === request.batchUuid ? { ...row, status: request.status } : row) } : old);
  void cache.invalidateQueries({ queryKey: ['batches', 'list'], refetchType: 'none' });
  cache.setQueryData(['settlement', 'request', request.uuid], request);
}
