import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useApiClient } from '../../common/http/useApiClient';
import { useAppFeedback } from '../../common/components/feedbackContext';
import { dashboardSchema, type Dashboard } from './contracts';
export function useDashboard(period: Dashboard['period']['kind']) {
  const api = useApiClient(); const { beginLoading } = useAppFeedback();
  const [previous, setPrevious] = useState<Dashboard | null>(null);
  const query = useQuery({ queryKey: ['dashboard', period], placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => { await Promise.resolve(); signal.throwIfAborted(); const end = beginLoading();
      try { return (await api.request('/api/dashboard', { schema: dashboardSchema.refine(data => data.period.kind === period), query: { period }, signal })).data; } finally { end(); }
    } });
  if (query.data && !query.isPlaceholderData && query.data !== previous) setPrevious(query.data);
  const data = query.data ?? previous;
  return { ...query, data, outdated: Boolean(data && (query.isError || query.isPlaceholderData || data.period.kind !== period)) };
}
