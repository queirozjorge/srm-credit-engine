import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '../../common/http/useApiClient';
import { ApiError } from '../../common/http/client';
import { useAppFeedback } from '../../common/components/feedbackContext';
import { useSession } from '../../auth/services/sessionContext';
import { can } from '../../auth/services/session';
import { batchDetailSchema, type BatchDetail } from '../../batch/services/contracts';
import { locale, translations } from '../../i18n/pt-BR';
import { requestSchema, type SettlementRequest } from './contracts';
import { reprocessRequestSchema, type ReprocessRequest } from './reprocessContracts';
import { acceptRequest } from './settlementCache';

export interface ReprocessIntent {
  readonly idempotencyKey: string;
  readonly receivableUuids: readonly string[];
  readonly reason: string;
}

export interface ReprocessError {
  code: string;
  message: string;
  status: number;
}

export interface ReprocessAttempt {
  intent: ReprocessIntent | null;
  pending: boolean;
  uncertain: boolean;
  reconciled: boolean;
  request: SettlementRequest | null;
  requestUuid: string | null;
  lastError: ReprocessError | null;
}

export interface ReprocessSettlementController extends ReprocessAttempt {
  authorized: boolean;
  canSubmit: boolean;
  submit: (input: ReprocessRequest) => Promise<boolean>;
  repeat: () => Promise<boolean>;
  reconcile: () => Promise<boolean>;
  clearIntent: () => void;
}

const emptyAttempt: ReprocessAttempt = {
  intent: null,
  pending: false,
  uncertain: false,
  reconciled: false,
  request: null,
  requestUuid: null,
  lastError: null,
};

function isUncertain(error: unknown) {
  return !(error instanceof ApiError) || error.status === 0 || error.status >= 500 || error.status === 409 || error.code === 'INVALID_RESPONSE';
}

function errorState(error: unknown): ReprocessError {
  return error instanceof ApiError
    ? { code: error.code, message: error.message, status: error.status }
    : { code: 'ERRO_INESPERADO', message: translations[locale].settlement.flow.uncertain, status: 0 };
}

export function useReprocessSettlement(batch: BatchDetail): ReprocessSettlementController {
  const api = useApiClient();
  const cache = useQueryClient();
  const { identity, session } = useSession();
  const { beginLoading, showWarning } = useAppFeedback();
  const sessionSignal = session.signal();
  const authorized = can(identity, 'settle');
  const stateKey = ['settlement', 'reprocess-attempt', batch.uuid] as const;

  const attemptQuery = useQuery<ReprocessAttempt>({
    queryKey: stateKey,
    enabled: false,
    initialData: emptyAttempt,
    queryFn: async () => cache.getQueryData<ReprocessAttempt>(stateKey) ?? emptyAttempt,
    gcTime: Infinity,
    staleTime: Infinity,
  });
  const attempt = attemptQuery.data;

  function current() {
    return cache.getQueryData<ReprocessAttempt>(stateKey) ?? emptyAttempt;
  }

  function update(next: Partial<ReprocessAttempt>) {
    if (!sessionSignal.aborted) cache.setQueryData<ReprocessAttempt>(stateKey, { ...current(), ...next });
  }

  function latestBatch() {
    return cache.getQueryData<BatchDetail>(['batches', 'detail', batch.uuid]) ?? batch;
  }

  async function readKnownRequest(requestUuid: string) {
    const { data } = await api.request(`/api/settlement-requests/${requestUuid}`, {
      schema: requestSchema.refine(request => request.uuid === requestUuid && request.batchUuid === batch.uuid && request.kind === 'REPROCESS'),
      notify: false,
    });
    if (sessionSignal.aborted) return null;
    acceptRequest(cache, data);
    update({ request: data, requestUuid: data.uuid, uncertain: false, reconciled: true, lastError: null });
    return data;
  }

  async function postIntent(intent: ReprocessIntent): Promise<boolean> {
    if (!authorized || current().pending || !intent.idempotencyKey) return false;
    update({ pending: true, reconciled: false, lastError: null });
    const end = beginLoading();
    try {
      const { data } = await api.request(`/api/batches/${batch.uuid}/settlements`, {
        method: 'POST',
        body: { receivableUuids: [...intent.receivableUuids], reason: intent.reason },
        idempotencyKey: intent.idempotencyKey,
        statuses: [200, 202],
        schema: requestSchema.refine(request => request.batchUuid === batch.uuid && request.kind === 'REPROCESS' && request.reason === intent.reason),
        notify: false,
      });
      if (sessionSignal.aborted) return false;
      acceptRequest(cache, data);
      update({ pending: false, uncertain: false, reconciled: true, request: data, requestUuid: data.uuid, lastError: null });
      return true;
    } catch (error) {
      if (sessionSignal.aborted) return false;
      const apiError = error instanceof ApiError ? error : null;
      const persistedRequestUuid = apiError?.status === 422 && apiError.code === 'NENHUM_TITULO_APTO'
        ? apiError.context?.requestUuid
        : undefined;
      const uncertain = persistedRequestUuid ? false : isUncertain(error);
      update({ pending: false, uncertain, reconciled: false, request: null,
        requestUuid: persistedRequestUuid ?? null, lastError: errorState(error) });
      showWarning({ message: apiError?.message ?? errorState(error).message });

      if (persistedRequestUuid) {
        try { await readKnownRequest(persistedRequestUuid); }
        catch { /* A solicitação já foi persistida; reconciliação permanece disponível pelo UUID. */ }
      } else if (uncertain && apiError?.status === 409) {
        try { await readBatch(); }
        catch { /* Mantém a intenção exata para repetição idempotente. */ }
      }
      return false;
    } finally {
      update({ pending: false });
      end();
    }
  }

  async function readBatch() {
    const { data } = await api.request(`/api/batches/${batch.uuid}`, {
      schema: batchDetailSchema.refine(row => row.uuid === batch.uuid),
      notify: false,
    });
    if (sessionSignal.aborted) return null;
    cache.setQueryData(['batches', 'detail', batch.uuid], data);
    return data;
  }

  async function submit(input: ReprocessRequest) {
    const state = current();
    const latest = latestBatch();
    if (!authorized || state.pending || state.uncertain || (latest.status !== 'FAILED' && latest.status !== 'PARTIALLY_SETTLED')) return false;
    const parsed = reprocessRequestSchema.safeParse(input);
    if (!parsed.success) return false;
    const intent: ReprocessIntent = {
      idempotencyKey: crypto.randomUUID(),
      receivableUuids: parsed.data.receivableUuids,
      reason: parsed.data.reason,
    };
    update({ intent, request: null, requestUuid: null, uncertain: false, reconciled: false, lastError: null });
    return postIntent(intent);
  }

  async function repeat() {
    const state = current();
    if (!authorized || state.pending || !state.uncertain || !state.intent) return false;
    return postIntent(state.intent);
  }

  async function reconcile() {
    const state = current();
    if (!authorized || state.pending || (!state.uncertain && !state.requestUuid)) return false;
    update({ pending: true });
    const end = beginLoading();
    try {
      if (state.requestUuid) {
        const request = await readKnownRequest(state.requestUuid);
        return request !== null;
      }
      const detail = await readBatch();
      if (!detail) return false;
      // A batch read can reveal current progress, but cannot prove which selection used an unknown key.
      update({ reconciled: true });
      return true;
    } catch (error) {
      if (!sessionSignal.aborted) {
        update({ lastError: errorState(error) });
        showWarning({ message: errorState(error).message });
      }
      return false;
    } finally {
      update({ pending: false });
      end();
    }
  }

  function clearIntent() {
    const state = current();
    if (state.pending || state.uncertain) return;
    cache.setQueryData<ReprocessAttempt>(stateKey, emptyAttempt);
  }

  const latest = latestBatch();
  const canSubmit = authorized && !attempt.pending && !attempt.uncertain
    && (latest.status === 'FAILED' || latest.status === 'PARTIALLY_SETTLED');

  return { ...attempt, authorized, canSubmit, submit, repeat, reconcile, clearIntent };
}
