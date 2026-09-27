import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, test } from 'vitest';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router';
import type { PropsWithChildren } from 'react';
import { AppProviders } from '../../app/AppProviders';
import { createSession } from '../../auth/services/session';
import { demoProfiles } from '../../auth/mocks/profiles';
import { server } from '../../common/testing/server';
import { batchFixture } from '../../batch/mocks/fixtures';
import { requestFixture } from '../mocks/fixtures';
import { useSettlement } from './useSettlement';
function wrapper({ children }: PropsWithChildren) {
  const session = createSession(); session.signIn(demoProfiles.operator);
  return <MemoryRouter><AppProviders session={session}>{children}</AppProviders></MemoryRouter>;
}
test('bloqueia duplo envio; POST sem body; após rede consulta antes de repetir a mesma chave', async () => {
  const keys: (string | null)[] = []; const bodies: string[] = []; let gets = 0;
  server.use(http.post('/api/batches/:id/settlements', async ({ request }) => {
    keys.push(request.headers.get('Idempotency-Key')); bodies.push(await request.text());
    return keys.length === 1 ? HttpResponse.error() : HttpResponse.json(requestFixture, { status: 202 });
  }), http.get('/api/batches/:id', () => { gets++; return HttpResponse.json(batchFixture); }));
  const { result } = renderHook(() => useSettlement(batchFixture), { wrapper });
  await act(async () => { await Promise.all([result.current.submit(), result.current.submit()]); });
  await waitFor(() => expect(result.current.uncertain).toBe(true));
  await act(() => result.current.submit()); expect(keys).toHaveLength(1);
  await act(() => result.current.reconcile()); await act(() => result.current.submit());
  expect(gets).toBe(1); expect(keys).toHaveLength(2); expect(keys[0]).toBeTruthy(); expect(keys[1]).toBe(keys[0]); expect(bodies).toEqual(['', '']);
  await act(() => result.current.submit()); expect(keys).toHaveLength(2);
});
test('409 reconcilia operação ativa e impede novo POST', async () => {
  let posts = 0;
  server.use(http.post('/api/batches/:id/settlements', () => { posts++; return HttpResponse.json({ code: 'CONFLITO', message: 'Operação em andamento.' }, { status: 409 }); }),
    http.get('/api/batches/:id', () => HttpResponse.json({ ...batchFixture, status: 'PENDING', counts: requestFixture.counts, activeRequest: requestFixture })));
  const { result } = renderHook(() => useSettlement(batchFixture), { wrapper });
  await act(() => result.current.submit()); await act(() => result.current.submit()); expect(posts).toBe(1);
  await waitFor(() => expect(result.current.uncertain).toBe(false));
});
test('falha definitiva não permite reenviar o lote inteiro', async () => {
  const keys: (string | null)[] = [];
  server.use(http.post('/api/batches/:id/settlements', ({ request }) => { keys.push(request.headers.get('Idempotency-Key'));
    return HttpResponse.json({ ...requestFixture, status: 'FAILED', counts: { ready: 0, pending: 0, settled: 0, failed: 1 }, completedAt: requestFixture.acceptedAt }); }));
  const { result } = renderHook(() => useSettlement(batchFixture), { wrapper });
  await act(() => result.current.submit()); expect(keys).toHaveLength(1);
  await act(() => result.current.submit()); expect(keys).toHaveLength(1);
});
