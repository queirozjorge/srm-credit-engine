import { useState } from 'react';
import type { z } from 'zod';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useApiClient } from '../../common/http/useApiClient';
import { useAppFeedback } from '../../common/components/feedbackContext';
import { statementPageSchema } from './contracts';
import { statementQuery, type statementFilters } from './statementFilters';
export function useStatement(filters: ReturnType<typeof statementFilters>) {
  const api = useApiClient(); const { beginLoading } = useAppFeedback(); const query = statementQuery(filters);
  const key = JSON.stringify(query);
  const [previous, setPrevious] = useState<{ key: string; data: z.infer<typeof statementPageSchema> } | null>(null);
  const result = useQuery({ queryKey: ['settlement', 'statement', query], enabled: Boolean(query), placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => { await Promise.resolve(); signal.throwIfAborted(); const end = beginLoading();
      try { return (await api.request('/api/settlements/items', { schema: statementPageSchema, query: query ?? {}, signal })).data; } finally { end(); }
    } });
  if (result.data && !result.isPlaceholderData && result.data !== previous?.data) setPrevious({ key, data: result.data });
  const data = result.data ?? previous?.data;
  return { ...result, data, outdated: Boolean(data && (result.isError || result.isPlaceholderData || previous?.key !== key)) };
}
