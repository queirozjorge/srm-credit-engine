import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '../../common/http/useApiClient';
import { useAppFeedback } from '../../common/components/feedbackContext';
import { exchangeViewSchema, referenceSchema } from './contracts';
import type { exchangeFilters } from './validation';
export function useExchange(filters: ReturnType<typeof exchangeFilters>) {
  const api = useApiClient(); const cache = useQueryClient(); const { beginLoading } = useAppFeedback();
  const view = useQuery({ queryKey: ['exchange', 'view', filters],
    queryFn: async ({ signal }) => { await Promise.resolve(); signal.throwIfAborted(); const end = beginLoading();
      try { return (await api.request('/api/exchange', { schema: exchangeViewSchema.refine(row => row.history.kind === filters.history), query: filters, signal })).data; } finally { end(); }
    }, placeholderData: (old, query) => (query?.queryKey[2] as typeof filters | undefined)?.history === filters.history ? old : undefined });
  const reference = useQuery({ queryKey: ['exchange', 'reference'], staleTime: Infinity, refetchOnMount: 'always',
    queryFn: async ({ signal }) => { await Promise.resolve(); signal.throwIfAborted(); const end = beginLoading();
      try { return (await api.request('/api/exchange/reference', { schema: referenceSchema, signal })).data; } finally { end(); }
    } });
  async function refresh() {
    await cache.invalidateQueries({ queryKey: ['exchange', 'view'], refetchType: 'none' });
    return view.refetch({ throwOnError: true });
  }
  return { view, reference, refresh };
}
