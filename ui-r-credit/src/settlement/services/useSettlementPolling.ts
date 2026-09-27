import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '../../common/http/useApiClient';
import { ApiError } from '../../common/http/client';
import { useAppFeedback } from '../../common/components/feedbackContext';
import type { SettlementRequest } from './contracts';
import { batchDetailSchema, type BatchDetail } from '../../batch/services/contracts';
import { acceptRequest } from './settlementCache';
export function useSettlementPolling(request: SettlementRequest | null) {
  const api = useApiClient(); const cache = useQueryClient(); const { showWarning } = useAppFeedback();
  const [updating, setUpdating] = useState(false); const warned = useRef(new Set<string>());
  const id = request?.uuid; const batch = request?.batchUuid; const pending = request?.status === 'PENDING';
  useEffect(() => {
    if (!id || !batch || !pending) return;
    let active = true; let timer: ReturnType<typeof setTimeout> | undefined; let controller: AbortController | null = null;
    async function tick() {
      if (!active || document.hidden || controller) return;
      const abort = new AbortController(); controller = abort; setUpdating(true);
      let terminal = false;
      try {
        const { data } = await api.request(`/api/batches/${batch}`, { schema: batchDetailSchema.refine(row => row.uuid === batch &&
          (row.activeRequest === null ? row.status === 'READY' : row.activeRequest.batchUuid === batch && row.activeRequest.status === row.status)), signal: abort.signal, notify: false });
        if (active && !abort.signal.aborted && cache.getQueryData<BatchDetail>(['batches', 'detail', batch])?.activeRequest?.uuid === id) {
          terminal = data.status !== 'PENDING';
          if (data.activeRequest) acceptRequest(cache, data.activeRequest, id);
          cache.setQueryData(['batches', 'detail', batch], data);
        }
      } catch (error) {
        if (active && !abort.signal.aborted && error instanceof ApiError && !warned.current.has(`${id}:${error.code}`)) {
          warned.current.add(`${id}:${error.code}`); showWarning({ message: error.message });
        }
      } finally {
        controller = null;
        if (active) { setUpdating(false); if (!terminal && !document.hidden) timer = setTimeout(() => { void tick(); }, 5000); }
      }
    }
    function visibility() {
      clearTimeout(timer);
      if (document.hidden) controller?.abort(); else if (!controller) void tick();
    }
    if (!document.hidden) timer = setTimeout(() => { void tick(); }, 5000);
    document.addEventListener('visibilitychange', visibility);
    return () => { active = false; clearTimeout(timer); controller?.abort(); document.removeEventListener('visibilitychange', visibility); };
  }, [api, cache, id, batch, pending, showWarning]);
  return pending && updating;
}
