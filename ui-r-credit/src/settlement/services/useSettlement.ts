import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '../../common/http/useApiClient';
import { ApiError } from '../../common/http/client';
import { useAppFeedback } from '../../common/components/feedbackContext';
import { useSession } from '../../auth/services/sessionContext';
import { can } from '../../auth/services/session';
import { batchDetailSchema, type BatchDetail } from '../../batch/services/contracts';
import { requestSchema } from './contracts';
import { acceptRequest } from './settlementCache';
import { locale, translations } from '../../i18n/pt-BR';
interface Attempt { key: string | null; pending: boolean; uncertain: boolean; checked: boolean; previousRequest: string | null }
const empty: Attempt = { key: null, pending: false, uncertain: false, checked: false, previousRequest: null };
export function useSettlement(batch: BatchDetail) {
  const api = useApiClient(); const cache = useQueryClient(); const { identity, session } = useSession(); const { beginLoading, showWarning } = useAppFeedback();
  const sessionSignal = session.signal();
  const text = translations[locale].settlement.flow; const key = ['settlement', 'attempt', batch.uuid];
  const query = useQuery<Attempt>({ queryKey: key, enabled: false, initialData: empty, gcTime: Infinity, staleTime: Infinity });
  const attempt = query.data;
  function current() { return cache.getQueryData<Attempt>(key) ?? empty; }
  function update(next: Partial<Attempt>) { if (!sessionSignal.aborted) cache.setQueryData(key, { ...current(), ...next }); }
  async function readBatch() {
    const { data } = await api.request(`/api/batches/${batch.uuid}`, { schema: batchDetailSchema.refine(row => row.uuid === batch.uuid) });
    if (sessionSignal.aborted) return;
    cache.setQueryData(['batches', 'detail', batch.uuid], data);
    if (data.activeRequest && (data.status === 'PENDING' || data.status === 'SETTLED' || data.activeRequest.uuid !== current().previousRequest)) {
      acceptRequest(cache, data.activeRequest); update({ uncertain: false, checked: true });
    } else update({ checked: true });
  }
  async function reconcile() {
    if (current().pending) return;
    update({ pending: true }); const end = beginLoading();
    try { await readBatch(); } catch { /* Aviso do cliente; chave e incerteza permanecem. */ }
    finally { update({ pending: false }); end(); }
  }
  async function submit() {
    const state = current(); const latest = cache.getQueryData<BatchDetail>(['batches', 'detail', batch.uuid]) ?? batch;
    if (!can(identity, 'settle') || state.pending || !['READY', 'FAILED'].includes(latest.status) || (state.uncertain && !state.checked)) return false;
    const idempotencyKey = state.uncertain && state.key ? state.key : crypto.randomUUID();
    update({ key: idempotencyKey, pending: true, previousRequest: latest.activeRequest?.uuid ?? null, checked: false });
    const end = beginLoading();
    try {
      const { data } = await api.request(`/api/batches/${batch.uuid}/settlements`, { method: 'POST', idempotencyKey, statuses: [200, 202],
        schema: requestSchema.refine(row => row.batchUuid === batch.uuid), notify: false });
      if (sessionSignal.aborted) return false;
      acceptRequest(cache, data); update({ uncertain: false }); return true;
    } catch (error) {
      if (sessionSignal.aborted) return false;
      const unknown = !(error instanceof ApiError) || error.status === 0 || error.status >= 500 || error.code === 'INVALID_RESPONSE';
      update({ uncertain: unknown });
      if (error instanceof ApiError && error.status === 409) {
        update({ uncertain: true });
        showWarning({ message: error.message });
        try { await readBatch(); } catch { /* GET conserva a chave e o estado incerto. */ }
      } else showWarning({ message: unknown ? text.uncertain : error.message });
      return false;
    } finally { update({ pending: false }); end(); }
  }
  return { ...attempt, submit, reconcile };
}
