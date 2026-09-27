import { useRef, useState } from 'react';
import { z } from 'zod';
import { useApiClient } from '../../common/http/useApiClient';
import { ApiError } from '../../common/http/client';
import { created } from '../../common/http/contracts';
import { useAppFeedback } from '../../common/components/feedbackContext';
import { useSession } from '../../auth/services/sessionContext';
import { can, canDecide } from '../../auth/services/session';
import { createProposalSchema, decideProposalSchema, proposalSchema, type ExchangeProposal } from './contracts';
import { locale, translations } from '../../i18n/pt-BR';
export function useExchangeMutation(initial: ExchangeProposal | null, refresh: () => Promise<unknown>) {
  const api = useApiClient(); const { identity } = useSession(); const { beginLoading, showWarning } = useAppFeedback();
  const text = translations[locale].exchange; const lock = useRef(false);
  const [pending, setPending] = useState(false); const [committed, setCommitted] = useState(false);
  const [blocked, setBlocked] = useState(false); const [latest, setLatest] = useState(initial);
  async function submit(input: unknown) {
    if (lock.current || committed || blocked || (latest ? latest.status !== 'PENDING' || !canDecide(identity, latest.requestedBy) : !can(identity, 'propose'))) return;
    const parsed = latest ? decideProposalSchema.safeParse(input) : createProposalSchema.safeParse(input); if (!parsed.success) return;
    lock.current = true; setPending(true); const end = beginLoading(); let accepted = false;
    try {
      if (latest) await api.request(`/api/exchange/proposals/${latest.uuid}`, { method: 'PATCH', body: { ...parsed.data, version: latest.version }, schema: z.undefined(), statuses: [204], notify: false });
      else await api.request('/api/exchange/proposals', { method: 'POST', body: parsed.data, schema: created, statuses: [201], notify: false });
      accepted = true; setCommitted(true); await refresh(); showWarning({ title: text.savedTitle, message: latest ? text.decided : text.proposed });
    } catch (error) {
      if (!accepted) {
        const uncertain = !(error instanceof ApiError) || error.status === 0 || error.status >= 500 || error.status === 409 || error.code === 'INVALID_RESPONSE';
        if (uncertain) setBlocked(true);
        showWarning({ message: error instanceof ApiError ? error.message : text.reconcileHint, details: uncertain ? [text.reconcileHint] : undefined });
      }
    } finally { lock.current = false; setPending(false); end(); }
  }
  async function reconcile() {
    if (lock.current) return; lock.current = true; setPending(true); const end = beginLoading();
    try {
      if (latest && !committed) {
        const { data } = await api.request(`/api/exchange/proposals/${latest.uuid}`, { schema: proposalSchema.refine(row => row.uuid === latest.uuid) });
        setLatest(data); setBlocked(false);
      } else await refresh();
    } catch { /* Erro central; não libera uma mutação incerta. */ }
    finally { lock.current = false; setPending(false); end(); }
  }
  return { submit, reconcile, pending, committed, blocked, latest };
}
