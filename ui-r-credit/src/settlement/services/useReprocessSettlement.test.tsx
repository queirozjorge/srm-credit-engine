import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, test } from 'vitest';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router';
import type { PropsWithChildren } from 'react';
import { AppProviders } from '../../app/AppProviders';
import { createSession } from '../../auth/services/session';
import { demoProfiles } from '../../auth/mocks/profiles';
import { server } from '../../common/testing/server';
import { demoUuid } from '../../common/testing/demo';
import { batchDetailSchema } from '../../batch/services/contracts';
import { batchFixture } from '../../batch/mocks/fixtures';
import { requestFixture } from '../mocks/fixtures';
import { requestSchema } from './contracts';
import { reprocessRequestSchema } from './reprocessContracts';
import { useReprocessSettlement } from './useReprocessSettlement';

const failedRequest = requestSchema.parse({ ...requestFixture, status: 'FAILED', completedAt: requestFixture.acceptedAt,
  counts: { ready: 0, pending: 0, settled: 0, failed: 1 } });
const failedBatch = batchDetailSchema.parse({ ...batchFixture, status: 'FAILED', counts: { ready: 0, pending: 0, settled: 0, failed: 1 }, activeRequest: failedRequest });

function wrapperFor(profile: typeof demoProfiles.operator | typeof demoProfiles.manager = demoProfiles.operator) {
  const session = createSession();
  session.signIn(profile);
  return function Wrapper({ children }: PropsWithChildren) {
    return <MemoryRouter><AppProviders session={session}>{children}</AppProviders></MemoryRouter>;
  };
}

function reprocessRequest() {
  const uuid = demoUuid(31);
  return requestSchema.parse({ ...requestFixture, uuid, batchUuid: failedBatch.uuid, kind: 'REPROCESS', reason: 'Revisar título',
    statusUrl: `/api/settlement-requests/${uuid}` });
}

test('envia seleção ordenada, justificativa normalizada e chave nova; aceita resposta 202', async () => {
  const submitted: { key: string | null; body: unknown }[] = [];
  const accepted = reprocessRequest();
  server.use(http.post('/api/batches/:id/settlements', async ({ request }) => {
    submitted.push({ key: request.headers.get('Idempotency-Key'), body: await request.json() });
    return HttpResponse.json(accepted, { status: 202 });
  }));
  const { result } = renderHook(() => useReprocessSettlement(failedBatch), { wrapper: wrapperFor() });
  await act(() => result.current.submit({ receivableUuids: [demoUuid(9), demoUuid(3)], reason: '  Revisar título  ' }));
  expect(submitted).toHaveLength(1);
  expect(submitted[0]?.key).toMatch(/^[0-9a-f-]{36}$/i);
  expect(submitted[0]?.body).toEqual({ receivableUuids: [demoUuid(3), demoUuid(9)], reason: 'Revisar título' });
  await waitFor(() => expect(result.current.request?.uuid).toBe(accepted.uuid));
  expect(result.current.uncertain).toBe(false);
  expect(result.current.pending).toBe(false);
});

test('contrato rejeita UUID repetido e normaliza a justificativa antes do envio', () => {
  expect(reprocessRequestSchema.safeParse({ receivableUuids: [demoUuid(3), demoUuid(3)], reason: 'Revisão' }).success).toBe(false);
  expect(reprocessRequestSchema.parse({ receivableUuids: [demoUuid(9), demoUuid(3)], reason: '  Revisão  ' }))
    .toEqual({ receivableUuids: [demoUuid(3), demoUuid(9)], reason: 'Revisão' });
});

test('mantém mesma chave e payload após falha de rede e repetição explícita', async () => {
  const submitted: { key: string | null; body: unknown }[] = [];
  const accepted = requestSchema.parse({ ...reprocessRequest(), reason: 'Falha de integração' });
  server.use(http.post('/api/batches/:id/settlements', async ({ request }) => {
    submitted.push({ key: request.headers.get('Idempotency-Key'), body: await request.json() });
    return submitted.length === 1 ? HttpResponse.error() : HttpResponse.json(accepted, { status: 200 });
  }));
  const { result } = renderHook(() => useReprocessSettlement(failedBatch), { wrapper: wrapperFor() });
  const input = { receivableUuids: [demoUuid(9), demoUuid(3)], reason: '  Falha de integração  ' };
  await act(() => result.current.submit(input));
  await waitFor(() => expect(result.current.uncertain).toBe(true));
  expect(result.current.intent).toMatchObject({ receivableUuids: [demoUuid(3), demoUuid(9)], reason: 'Falha de integração' });
  await act(() => result.current.repeat());
  expect(submitted).toHaveLength(2);
  expect(submitted[1]).toEqual(submitted[0]);
  await waitFor(() => expect(result.current.request?.uuid).toBe(accepted.uuid));
});

test('consulta lote sem descartar intenção incerta; repetição permanece disponível', async () => {
  let reads = 0;
  server.use(http.post('/api/batches/:id/settlements', () => HttpResponse.error()),
    http.get('/api/batches/:id', () => { reads++; return HttpResponse.json(failedBatch); }));
  const { result } = renderHook(() => useReprocessSettlement(failedBatch), { wrapper: wrapperFor() });
  await act(() => result.current.submit({ receivableUuids: [demoUuid(3)], reason: 'Revisar título' }));
  await waitFor(() => expect(result.current.uncertain).toBe(true));
  const intent = result.current.intent;
  await act(() => result.current.reconcile());
  expect(reads).toBe(1);
  expect(result.current.reconciled).toBe(true);
  expect(result.current.uncertain).toBe(true);
  expect(result.current.intent).toEqual(intent);
});

test('consulta solicitação persistida em 422 NENHUM_TITULO_APTO', async () => {
  const persisted = requestSchema.parse({ ...reprocessRequest(), status: 'FAILED', completedAt: requestFixture.acceptedAt,
    counts: { ready: 0, pending: 0, settled: 0, failed: 1 } });
  let detailReads = 0;
  server.use(http.post('/api/batches/:id/settlements', () => HttpResponse.json({ code: 'NENHUM_TITULO_APTO', message: 'Nenhum título apto.',
    context: { requestUuid: persisted.uuid, statusUrl: persisted.statusUrl } }, { status: 422 })),
  http.get('/api/settlement-requests/:uuid', () => { detailReads++; return HttpResponse.json(persisted); }));
  const { result } = renderHook(() => useReprocessSettlement(failedBatch), { wrapper: wrapperFor() });
  await act(() => result.current.submit({ receivableUuids: [demoUuid(3)], reason: 'Revisar título' }));
  await waitFor(() => expect(result.current.request?.uuid).toBe(persisted.uuid));
  expect(detailReads).toBe(1);
  expect(result.current.uncertain).toBe(false);
  expect(result.current.requestUuid).toBe(persisted.uuid);
});

test('somente OPERADOR e lote terminal com falha podem iniciar reprocessamento', async () => {
  let posts = 0;
  server.use(http.post('/api/batches/:id/settlements', () => { posts++; return HttpResponse.json(reprocessRequest(), { status: 202 }); }));
  const manager = renderHook(() => useReprocessSettlement(failedBatch), { wrapper: wrapperFor(demoProfiles.manager) });
  expect(manager.result.current.authorized).toBe(false);
  await act(() => manager.result.current.submit({ receivableUuids: [demoUuid(3)], reason: 'Revisar título' }));
  const ready = renderHook(() => useReprocessSettlement(batchFixture), { wrapper: wrapperFor() });
  expect(ready.result.current.canSubmit).toBe(false);
  await act(() => ready.result.current.submit({ receivableUuids: [demoUuid(3)], reason: 'Revisar título' }));
  expect(posts).toBe(0);
});
