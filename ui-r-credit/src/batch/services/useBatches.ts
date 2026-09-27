import type { z } from 'zod';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useApiClient } from '../../common/http/useApiClient';
import { useAppFeedback } from '../../common/components/feedbackContext';
import { pageOf, uuid } from '../../common/http/contracts';
import { batchDetailSchema, batchPageSchema, batchStatus } from './contracts';
import { receivableSchema } from './receivableContracts';
export function pagination(params: URLSearchParams) {
  const raw = params.get('page') ?? '1'; const page = Number(raw);
  return { page: /^\d+$/.test(raw) && Number.isSafeInteger(page) && page > 0 ? page : 1,
    size: [5, 10, 20, 50].includes(Number(params.get('size'))) ? Number(params.get('size')) : 20 };
}
export function batchFilters(params: URLSearchParams) {
  const status = batchStatus.safeParse(params.get('status'));
  return { ...pagination(params), q: params.get('q')?.trim() ?? '', status: status.success ? status.data : undefined };
}
export function useBatchList(filters: ReturnType<typeof batchFilters>, enabled: boolean) {
  const api = useApiClient(); const { beginLoading } = useAppFeedback();
  return useQuery({ queryKey: ['batches', 'list', filters], enabled, placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => {
      // Deixa o ciclo de montagem cancelar a consulta antes de abrir a conexão.
      await Promise.resolve(); signal.throwIfAborted();
      const end = beginLoading();
      try { return (await api.request('/api/batches', { schema: batchPageSchema, query: filters, signal })).data; }
      finally { end(); }
    } });
}
const receivablePage = pageOf(receivableSchema);
export function useBatchDetail(id: string, filters: ReturnType<typeof pagination>) {
  const api = useApiClient(); const { beginLoading } = useAppFeedback();
  const valid = uuid.safeParse(id).success;
  const detail = useQuery({ queryKey: ['batches', 'detail', id], enabled: valid,
    queryFn: async ({ signal }) => {
      // Deixa o ciclo de montagem cancelar a consulta antes de abrir a conexão.
      await Promise.resolve(); signal.throwIfAborted();
      const end = beginLoading();
      try { return (await api.request(`/api/batches/${id}`, { schema: batchDetailSchema, signal })).data; }
      finally { end(); }
    } });
  const items = useQuery<z.infer<typeof receivablePage>>({ queryKey: ['batches', 'items', id, filters], enabled: valid && Boolean(detail.data) && !detail.isError,
    placeholderData: (previous, query) => query?.queryKey[2] === id ? previous : undefined,
    queryFn: async ({ signal }) => {
      // Deixa o ciclo de montagem cancelar a consulta antes de abrir a conexão.
      await Promise.resolve(); signal.throwIfAborted();
      const end = beginLoading();
      try { return (await api.request(`/api/batches/${id}/receivables`, { schema: receivablePage, query: filters, signal })).data; }
      finally { end(); }
    } });
  return { detail, items, valid };
}
