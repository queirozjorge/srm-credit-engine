import { useEffect, useState } from 'react';
import type { z } from 'zod';
import { useApiClient } from '../../common/http/useApiClient';
import { useAppFeedback } from '../../common/components/feedbackContext';
import { ApiError } from '../../common/http/client';
import { simulationInputSchema, simulationSchema, type Simulation } from './contracts';
export type SimulationInput = z.infer<typeof simulationInputSchema>;
export function useSimulation(input: SimulationInput | null, enabled: boolean, scope = '', expectedCount?: number) {
  const api = useApiClient(); const { showWarning } = useAppFeedback(); const [revision, setRevision] = useState(0);
  const body = input && simulationInputSchema.safeParse(input).success ? JSON.stringify(input) : null;
  const count = input && 'items' in input ? input.items.length : expectedCount;
  const key = `${scope}:${body}:${revision}`;
  const [result, setResult] = useState<{ key: string; data: Simulation | null; phase: 'pending' | 'success' | 'error' }>({ key: '', data: null, phase: 'pending' });
  useEffect(() => {
    if (!body || !enabled) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setResult(old => ({ ...old, key, phase: 'pending' }));
      try {
        const response = await api.request('/api/simulations', { method: 'POST', body: JSON.parse(body), schema: simulationSchema.refine(data => count === undefined || data.items.length === count), signal: controller.signal, notify: false });
        if (!controller.signal.aborted) setResult({ key, data: response.data, phase: 'success' });
      } catch (error) {
        if (controller.signal.aborted) return;
        setResult(old => ({ ...old, key, phase: 'error' }));
        if (error instanceof ApiError) showWarning({ message: error.message, dedupeKey: `simulation:${error.code}` });
      }
    }, 400);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [api, body, key, enabled, count, showWarning]);
  const valid = enabled && Boolean(body) && result.key === key && result.phase === 'success';
  return { data: result.data, valid, updating: enabled && Boolean(body) && (key !== result.key || result.phase === 'pending'), refresh: () => setRevision(value => value + 1) };
}
