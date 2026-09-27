import { http, HttpResponse } from 'msw';
import { authorize, paginated, failure, demoTime, demoText, readBody } from '../../common/testing/demo';
import { demoProfiles } from '../../auth/mocks/profiles';
import { canDecide } from '../../auth/services/session';
import { quoteFixture, proposalFixture } from './fixtures';
import { createProposalSchema, decideProposalSchema, type ExchangeProposal, type quoteSchema } from '../services/contracts';
import type { z } from 'zod';
export function createExchangeStore() { return { proposals: structuredClone([proposalFixture]), quotes: structuredClone([quoteFixture]) }; }
export function currentQuote(quotes: z.infer<typeof quoteSchema>[], now: number) {
  const current = [...quotes].filter(row => Date.parse(row.effectiveFrom) <= now).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || b.uuid.localeCompare(a.uuid))[0] ?? null;
  return { current, currentStatus: !current ? 'ABSENT' as const : now <= Date.parse(current.validUntil) ? 'VALID' as const : 'EXPIRED' as const };
}
export function createExchangeHandlers(store = createExchangeStore()) {
  return [
    http.get('/api/exchange', async ({ request }) => {
      const denied = authorize(request); if (denied) return denied;
      const params = new URL(request.url).searchParams; const kind = params.get('history') ?? 'proposals'; const status = params.get('status');
      if (!['proposals', 'quotes'].includes(kind) || (status && (kind === 'quotes' || !['PENDING', 'APPROVED', 'REJECTED'].includes(status)))) return failure(400, 'REQUISICAO_INVALIDA');
      const response = kind === 'quotes' ? paginated(request, [...store.quotes].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || b.uuid.localeCompare(a.uuid)))
        : paginated(request, store.proposals.filter(row => !status || row.status === status).sort((a, b) => b.registeredAt.localeCompare(a.registeredAt) || b.uuid.localeCompare(a.uuid)));
      if (!response.ok) return response;
      const now = Date.now(); return HttpResponse.json({ evaluatedAt: new Date(now).toISOString(), ...currentQuote(store.quotes, now), history: { kind, page: await response.json() } });
    }),
    http.get('/api/exchange/reference', ({ request }) => authorize(request) ?? HttpResponse.json({ rate: '5.00', observedAt: demoTime })),
    http.get('/api/exchange/proposals/:uuid', ({ request, params }) => {
      const denied = authorize(request); if (denied) return denied;
      const row = store.proposals.find(row => row.uuid === params.uuid); return row ? HttpResponse.json(row) : failure(404, 'RECURSO_NAO_ENCONTRADO', demoText.missing);
    }),
    http.post('/api/exchange/proposals', async ({ request }) => {
      const denied = authorize(request, 'propose'); if (denied) return denied;
      const parsed = await readBody(request, createProposalSchema); if (!parsed.success) return failure(422, 'PROPOSTA_INVALIDA');
      const identity = Object.values(demoProfiles).find(row => row.subject === request.headers.get('X-Demo-Subject'))!;
      const row: ExchangeProposal = { ...parsed.data, uuid: crypto.randomUUID(), status: 'PENDING', registeredAt: new Date().toISOString(), requestedBy: identity, version: '0', decision: null };
      store.proposals.unshift(row); return HttpResponse.json({ uuid: row.uuid }, { status: 201, headers: { Location: `/api/exchange/proposals/${row.uuid}` } });
    }),
    http.patch('/api/exchange/proposals/:uuid', async ({ request, params }) => {
      const denied = authorize(request, 'decide'); if (denied) return denied;
      const row = store.proposals.find(row => row.uuid === params.uuid); if (!row) return failure(404, 'RECURSO_NAO_ENCONTRADO', demoText.missing);
      const identity = Object.values(demoProfiles).find(row => row.subject === request.headers.get('X-Demo-Subject'))!;
      if (!canDecide(identity, row.requestedBy)) return failure(403, 'AUTOAPROVACAO_PROIBIDA', demoText.denied);
      const parsed = await readBody(request, decideProposalSchema); if (!parsed.success) return failure(422, 'DECISAO_INVALIDA');
      if (row.version !== parsed.data.version || row.status !== 'PENDING') return failure(409, 'VERSAO_DESATUALIZADA');
      const decidedAt = new Date().toISOString();
      if (parsed.data.status === 'APPROVED') {
        const quote = { uuid: crypto.randomUUID(), proposalUuid: row.uuid, rate: row.proposedRate, effectiveFrom: decidedAt, validUntil: new Date(Date.parse(decidedAt) + 86400000).toISOString() };
        row.decision = { status: 'APPROVED', decidedBy: identity, decidedAt, reason: parsed.data.decisionReason ?? null, quote }; store.quotes.unshift(quote);
      } else row.decision = { status: 'REJECTED', decidedBy: identity, decidedAt, reason: parsed.data.decisionReason!, quote: null };
      row.status = parsed.data.status; row.version = String(BigInt(row.version) + 1n);
      return new HttpResponse(null, { status: 204 });
    }),
  ];
}
export const exchangeHandlers = createExchangeHandlers();
