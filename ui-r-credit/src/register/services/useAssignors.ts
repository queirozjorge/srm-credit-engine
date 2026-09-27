import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useApiClient } from '../../common/http/useApiClient';
import { useAppFeedback } from '../../common/components/feedbackContext';
import { assignorPageSchema, assignorSchema, type Assignor } from './contracts';
import { uuid } from '../../common/http/contracts';
import type { listParameters } from './validation';
export const assignorKeys = { lists: ['assignors', 'list'] as const, detail: (id: string) => ['assignors', 'detail', id] as const };
export function useAssignors(filters: ReturnType<typeof listParameters>, selected: string | null) {
  const api = useApiClient(); const { beginLoading } = useAppFeedback(); const cache = useQueryClient();
  async function list(signal?: AbortSignal) {
    const end = beginLoading();
    try { return (await api.request('/api/assignors', { schema: assignorPageSchema, query: filters, signal })).data; }
    finally { end(); }
  }
  async function get(id: string, signal?: AbortSignal) {
    const end = beginLoading();
    try { return (await api.request(`/api/assignors/${id}`, { schema: assignorSchema, signal })).data; }
    finally { end(); }
  }
  const listing = useQuery({ queryKey: [...assignorKeys.lists, filters], queryFn: ({ signal }) => list(signal), enabled: !selected, placeholderData: keepPreviousData });
  const detail = useQuery({ queryKey: assignorKeys.detail(selected ?? ''), queryFn: ({ signal }) => get(selected ?? '', signal), enabled: Boolean(selected && uuid.safeParse(selected).success) });
  function updateCached(row: Assignor) {
    cache.setQueryData(assignorKeys.detail(row.uuid), row);
    cache.setQueriesData<{ items: Assignor[] }>({ queryKey: assignorKeys.lists }, old => old ? { ...old, items: old.items.map(item => item.uuid === row.uuid ? row : item) } : old);
    void cache.invalidateQueries({ queryKey: assignorKeys.lists, refetchType: 'none' });
  }
  async function refreshDetail(id: string) {
    const row = await get(id); updateCached(row); return row;
  }
  async function refreshList() {
    await cache.invalidateQueries({ queryKey: assignorKeys.lists, refetchType: 'none' });
    return listing.refetch({ throwOnError: true });
  }
  return { listing, detail, refreshDetail, refreshList };
}
