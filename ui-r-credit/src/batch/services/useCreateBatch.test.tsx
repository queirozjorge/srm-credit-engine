import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, test } from 'vitest';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router';
import type { PropsWithChildren } from 'react';
import { AppProviders } from '../../app/AppProviders';
import { createSession } from '../../auth/services/session';
import { demoProfiles } from '../../../tests/auth/mocks/profiles';
import { server } from '../../../tests/common/testing/server';
import { batchFixture, receivableFixture } from '../../../tests/batch/mocks/fixtures';
import { useCreateBatch } from './useCreateBatch';
const item = { ...receivableFixture, localId: 'local', externalReference: ' 000001 ', dueDate: '2099-12-31' };
function wrapper({ children }: PropsWithChildren) {
  const session = createSession(); session.signIn(demoProfiles.operator, demoProfiles.operator.subject);
  return <MemoryRouter><AppProviders session={session}>{children}</AppProviders></MemoryRouter>;
}
beforeEach(() => server.use(http.get('/api/batches/:id', () => HttpResponse.json(batchFixture))));
test('duplo clique produz um POST estrito e uma consulta, sem liquidação', async () => {
  const methods: string[] = []; let body: unknown;
  server.use(http.post('/api/batches', async ({ request }) => { methods.push('POST'); body = await request.json(); return HttpResponse.json({ uuid: batchFixture.uuid, status: 'READY' }, { status: 201 }); }),
    http.get('/api/batches/:id', () => { methods.push('GET'); return HttpResponse.json(batchFixture); }));
  const { result } = renderHook(useCreateBatch, { wrapper });
  await act(async () => { await Promise.all([result.current.submit([item]), result.current.submit([item])]); });
  expect(methods).toEqual(['POST', 'GET']);
  expect(body).toEqual({ items: [{ assignorUuid: item.assignorUuid, externalReference: '000001', type: item.type, faceValueBrl: item.faceValueBrl, dueDate: item.dueDate, paymentCurrency: item.paymentCurrency }] });
  expect(result.current.verified).toBe(true);
  await act(() => result.current.submit([item])); expect(methods).toHaveLength(2);
});
test('POST aceito seguido de falha de consulta libera apenas novo GET', async () => {
  let posts = 0; let gets = 0;
  server.use(http.post('/api/batches', () => { posts++; return HttpResponse.json({ uuid: batchFixture.uuid, status: 'READY' }, { status: 201 }); }),
    http.get('/api/batches/:id', () => { gets++; return gets === 1 ? new HttpResponse(null, { status: 503 }) : HttpResponse.json(batchFixture); }));
  const { result } = renderHook(useCreateBatch, { wrapper });
  await act(() => result.current.submit([item]));
  expect(result.current.created).toBe(batchFixture.uuid); expect(result.current.verified).toBe(false);
  await act(() => result.current.submit([item])); await act(() => result.current.refresh());
  expect(posts).toBe(1); expect(gets).toBe(2); expect(result.current.verified).toBe(true);
});
test.each(['network', 'invalid', 'server'] as const)('resultado incerto %s bloqueia repetição automática', async kind => {
  let posts = 0;
  server.use(http.post('/api/batches', () => { posts++; return kind === 'network' ? HttpResponse.error() : kind === 'server' ? new HttpResponse(null, { status: 503 }) : HttpResponse.json({}, { status: 201 }); }));
  const { result } = renderHook(useCreateBatch, { wrapper });
  await act(() => result.current.submit([item]));
  await waitFor(() => expect(result.current.uncertain).toBe(true));
  await act(() => result.current.submit([item])); expect(posts).toBe(1);
});
