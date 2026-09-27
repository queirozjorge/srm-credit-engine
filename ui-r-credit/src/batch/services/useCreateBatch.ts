import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '../../common/http/useApiClient';
import { ApiError } from '../../common/http/client';
import { useAppFeedback } from '../../common/components/feedbackContext';
import { locale, translations } from '../../i18n/pt-BR';
import { batchCreatedSchema, batchDetailSchema } from './contracts';
import { inputOf, validateManual, type DraftItem } from './manualBatch';
export function useCreateBatch() {
  const api = useApiClient(); const cache = useQueryClient(); const { beginLoading, showWarning } = useAppFeedback();
  const text = translations[locale].batch.manual;
  const lock = useRef(false); const accepted = useRef<string | null>(null);
  const [pending, setPending] = useState(false); const [created, setCreated] = useState<string | null>(null);
  const [verified, setVerified] = useState(false); const [uncertain, setUncertain] = useState(false);
  async function readCreated(id: string) {
    const { data } = await api.request(`/api/batches/${id}`, { schema: batchDetailSchema });
    cache.setQueryData(['batches', 'detail', id], data); setVerified(true);
    showWarning({ title: text.savedTitle, message: text.saved });
  }
  async function submit(items: DraftItem[] | FormData, callbacks?: { onAccepted: () => void; onRejected: () => void }) {
    if (lock.current || accepted.current || uncertain) return;
    const invalid = Array.isArray(items) ? validateManual(items) : null;
    if (invalid) { showWarning({ message: text.errors[invalid] }); return; }
    lock.current = true; setPending(true); const end = beginLoading();
    try {
      const { data } = await api.request('/api/batches', { method: 'POST', body: Array.isArray(items) ? { items: items.map(inputOf) } : items, statuses: [201], schema: batchCreatedSchema, notify: false });
      accepted.current = data.uuid; setCreated(data.uuid); callbacks?.onAccepted();
      await cache.invalidateQueries({ queryKey: ['batches', 'list'], refetchType: 'none' });
      await readCreated(data.uuid);
    } catch (error) {
      if (!accepted.current) {
        const unknown = !(error instanceof ApiError) || error.status === 0 || error.status >= 500 || error.code === 'INVALID_RESPONSE';
        setUncertain(unknown); if (!unknown) callbacks?.onRejected();
        showWarning({ message: unknown ? text.uncertain : error.message,
          details: !unknown && error instanceof ApiError ? error.details?.map(detail => items instanceof FormData ? translations[locale].batch.import.issue(detail.line, detail.field, detail.message) : detail.message) : undefined });
      }
      // Falha após 201 já foi apresentada pelo cliente; somente GET pode ser repetido.
    } finally { lock.current = false; setPending(false); end(); }
  }
  async function refresh() {
    if (!accepted.current || lock.current) return;
    lock.current = true; setPending(true); const end = beginLoading();
    try { await readCreated(accepted.current); } catch { /* Aviso centralizado; cadastro não é repetido. */ }
    finally { lock.current = false; setPending(false); end(); }
  }
  return { pending, created, verified, uncertain, submit, refresh, resume: () => setUncertain(false), reset: () => {
    if (lock.current || !accepted.current) return;
    accepted.current = null; setCreated(null); setVerified(false); setUncertain(false);
  } };
}
