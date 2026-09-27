import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router';
import type { PropsWithChildren } from 'react';
import { AppProviders } from '../../app/AppProviders';
import { createSession } from '../../auth/services/session';
import { demoProfiles } from '../../../tests/auth/mocks/profiles';
import { server } from '../../../tests/common/testing/server';
import { proposalFixture } from '../../../tests/exchange/mocks/fixtures';
import { useExchangeMutation } from './useExchangeMutation';
function wrapper({ children }: PropsWithChildren) {
  const session = createSession(); session.signIn(demoProfiles.combined, demoProfiles.combined.subject);
  return <MemoryRouter><AppProviders session={session}>{children}</AppProviders></MemoryRouter>;
}
test('proposta estrita: um POST e uma atualização; falha de consulta não libera novo envio', async () => {
  let posts = 0; let body: unknown;
  server.use(http.post('/api/exchange/proposals', async ({ request }) => { posts++; body = await request.json(); return HttpResponse.json({ uuid: proposalFixture.uuid }, { status: 201 }); }));
  const refresh = vi.fn().mockRejectedValueOnce(new Error('GET indisponível')).mockResolvedValue(undefined);
  const { result } = renderHook(() => useExchangeMutation(null, refresh), { wrapper });
  const input = { proposedRate: '5.123456789012', justification: ' Revisão da cotação ' };
  await act(async () => { await Promise.all([result.current.submit(input), result.current.submit(input)]); });
  expect(posts).toBe(1); expect(body).toEqual({ proposedRate: input.proposedRate, justification: 'Revisão da cotação' });
  await act(() => result.current.submit(input)); expect(posts).toBe(1);
  await act(() => result.current.reconcile()); expect(refresh).toHaveBeenCalledTimes(2);
});
test('autoaprovação é bloqueada mesmo com ambos os papéis', async () => {
  let patches = 0; server.use(http.patch('/api/exchange/proposals/:uuid', () => { patches++; return new HttpResponse(null, { status: 204 }); }));
  const { result } = renderHook(() => useExchangeMutation({ ...proposalFixture, requestedBy: demoProfiles.combined }, vi.fn()), { wrapper });
  await act(() => result.current.submit({ status: 'APPROVED', version: '0' })); expect(patches).toBe(0);
});
test('409 exige consulta; decisão concorrente impede novo PATCH e preserva proposta', async () => {
  let patches = 0; let gets = 0; const refresh = vi.fn();
  server.use(http.patch('/api/exchange/proposals/:uuid', () => { patches++; return HttpResponse.json({ code: 'VERSAO_DESATUALIZADA', message: 'Proposta já decidida.' }, { status: 409 }); }),
    http.get('/api/exchange/proposals/:uuid', () => { gets++; return HttpResponse.json({ ...proposalFixture, status: 'REJECTED', version: '1', decision: { status: 'REJECTED', decidedBy: demoProfiles.manager, decidedAt: proposalFixture.registeredAt, reason: 'Condições divergentes.', quote: null } }); }));
  const { result } = renderHook(() => useExchangeMutation(proposalFixture, refresh), { wrapper });
  await act(() => result.current.submit({ status: 'APPROVED', version: '0' }));
  await waitFor(() => expect(result.current.blocked).toBe(true));
  await act(() => result.current.submit({ status: 'APPROVED', version: '0' })); expect(patches).toBe(1);
  await act(() => result.current.reconcile()); await act(() => result.current.submit({ status: 'APPROVED', version: '1' }));
  expect(patches).toBe(1); expect(gets).toBe(1); expect(result.current.latest?.proposedRate).toBe(proposalFixture.proposedRate);
});
test('resultado incerto preserva rascunho e bloqueia repetição automática', async () => {
  let posts = 0; server.use(http.post('/api/exchange/proposals', () => { posts++; return HttpResponse.error(); }));
  const { result } = renderHook(() => useExchangeMutation(null, vi.fn()), { wrapper });
  const input = { proposedRate: '5.2', justification: 'Revisão' };
  await act(() => result.current.submit(input)); await act(() => result.current.submit(input)); expect(posts).toBe(1);
  await act(() => result.current.reconcile()); await act(() => result.current.submit(input)); expect(posts).toBe(1);
});
