import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router';
import { useSession } from '../../auth/services/sessionContext';
import { pageOf } from '../../common/http/contracts';
import { useApiClient } from '../../common/http/useApiClient';
import { ApiError } from '../../common/http/client';
import { useAppFeedback } from '../../common/components/feedbackContext';
import { pagination } from '../../batch/services/useBatches';
import { batchDetailSchema, type BatchDetail } from '../../batch/services/contracts';
import { receivableSchema } from '../../batch/services/receivableContracts';
import type { SettlementRequest } from './contracts';
import { acceptRequest } from './settlementCache';

const receivablePageSchema = pageOf(receivableSchema);

export function useSettlementPolling(request: SettlementRequest | null, receivablesVisible = true) {
  const api = useApiClient(); const cache = useQueryClient(); const { showWarning } = useAppFeedback();
  const { identity, expired } = useSession(); const location = useLocation();
  const [updating, setUpdating] = useState(false); const warned = useRef(new Set<string>());
  const id = request?.uuid; const batch = request?.batchUuid; const pending = request?.status === 'PENDING';
  const sessionActive = Boolean(identity) && !expired;
  const queryParams = new URLSearchParams(location.search);
  const filters = pagination(queryParams);
  const { page, size } = filters;
  const tab = queryParams.get('tab');
  const titlePageVisible = receivablesVisible && tab !== 'requests' && tab !== 'audit';
  const refreshTarget = useRef({ visible: titlePageVisible, filters: { page, size } });
  useEffect(() => { refreshTarget.current = { visible: titlePageVisible, filters: { page, size } }; }, [page, size, titlePageVisible]);

  useEffect(() => {
    if (!id || !batch || !pending || !sessionActive) return;
    let active = true; let timer: ReturnType<typeof setTimeout> | undefined; let controller: AbortController | null = null;
    let resumeImmediately = false;

    async function tick() {
      if (!active || document.hidden || controller || !sessionActive) return;
      const abort = new AbortController(); controller = abort; setUpdating(true);
      let terminal = false;
      try {
        const { data } = await api.request(`/api/batches/${batch}`, { schema: batchDetailSchema.refine(row => row.uuid === batch &&
          (row.activeRequest === null ? row.status === 'READY' : row.activeRequest.batchUuid === batch)),
          signal: abort.signal, notify: false });
        if (!active || abort.signal.aborted) return;
        terminal = data.status !== 'PENDING';
        const detailKey = ['batches', 'detail', batch];
        const current = cache.getQueryData<BatchDetail>(detailKey);
        const progressChanged = current?.progressVersion !== data.progressVersion;
        if (data.activeRequest) acceptRequest(cache, data.activeRequest, current?.activeRequest?.uuid === id ? id : undefined);
        cache.setQueryData(detailKey, data);

        const target = refreshTarget.current;
        if (target.visible && (progressChanged || terminal)) {
          const itemsKey = ['batches', 'items', batch, target.filters];
          const { data: items } = await api.request(`/api/batches/${batch}/receivables`, {
            schema: receivablePageSchema, query: target.filters, signal: abort.signal, notify: false,
          });
          if (active && !abort.signal.aborted) cache.setQueryData(itemsKey, items);
        }
      } catch (error) {
        if (active && !abort.signal.aborted && error instanceof ApiError && !warned.current.has(`${id}:${error.code}`)) {
          warned.current.add(`${id}:${error.code}`); showWarning({ message: error.message });
        }
      } finally {
        controller = null;
        if (active) {
          setUpdating(false);
          if (!terminal && sessionActive && !document.hidden) {
            const delay = resumeImmediately ? 0 : 5000;
            resumeImmediately = false;
            timer = setTimeout(() => { void tick(); }, delay);
          }
        }
      }
    }

    function visibility() {
      clearTimeout(timer);
      if (document.hidden) { controller?.abort(); return; }
      if (!controller) void tick();
      else resumeImmediately = true;
    }

    if (!document.hidden) timer = setTimeout(() => { void tick(); }, 5000);
    document.addEventListener('visibilitychange', visibility);
    return () => { active = false; clearTimeout(timer); controller?.abort(); document.removeEventListener('visibilitychange', visibility); };
  }, [api, cache, id, batch, pending, sessionActive, showWarning]);

  return pending && sessionActive && updating;
}
