import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import type { PropsWithChildren } from 'react';
import { requestFixture } from '../mocks/fixtures';
import { batchFixture, receivableFixture } from '../../batch/mocks/fixtures';
import type { BatchDetail } from '../../batch/services/contracts';
import { useSettlementPolling } from './useSettlementPolling';

const mocks = vi.hoisted(() => ({
  request: vi.fn(), showWarning: vi.fn(),
  session: { identity: { issuer: 'demo', subject: 'operator', roles: ['OPERADOR'] }, expired: false },
}));
vi.mock('../../common/http/useApiClient', () => ({ useApiClient: () => mocks }));
vi.mock('../../common/components/feedbackContext', () => ({ useAppFeedback: () => mocks }));
vi.mock('../../auth/services/sessionContext', () => ({ useSession: () => ({ ...mocks.session, session: {} }) }));

const pendingBatch: BatchDetail = { ...batchFixture, status: 'PENDING', counts: requestFixture.counts, activeRequest: requestFixture };
const receivablePage = { items: [receivableFixture], page: 3, size: 5, totalItems: 11, totalPages: 3 };
const itemsPath = `/api/batches/${batchFixture.uuid}/receivables`;

function wrapperFor(cache: QueryClient, entry = `/lotes/${batchFixture.uuid}`) {
  return ({ children }: PropsWithChildren) => <MemoryRouter initialEntries={[entry]}>
    <QueryClientProvider client={cache}>{children}</QueryClientProvider>
  </MemoryRouter>;
}

function makeCache() {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  cache.setQueryData(['batches', 'detail', batchFixture.uuid], pendingBatch);
  return cache;
}

function terminalBatch(progressVersion = pendingBatch.progressVersion): BatchDetail {
  const failedRequest = { ...requestFixture, status: 'FAILED' as const,
    counts: { ready: 0, pending: 0, settled: 0, failed: 1 }, completedAt: requestFixture.acceptedAt };
  return { ...pendingBatch, status: 'FAILED', counts: failedRequest.counts, activeRequest: failedRequest, progressVersion };
}

beforeEach(() => {
  mocks.request.mockReset(); mocks.showWarning.mockReset();
  mocks.session.identity = { issuer: 'demo', subject: 'operator', roles: ['OPERADOR'] };
  mocks.session.expired = false;
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

test('mantém cadência de cinco segundos, evita sobreposição, suspende oculta e encerra no estado terminal', async () => {
  vi.useFakeTimers(); let hidden = false; vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  const cache = makeCache();
  let resolvePoll: ((response: { data: BatchDetail }) => void) | undefined;
  mocks.request.mockImplementationOnce(() => new Promise(resolve => { resolvePoll = resolve; }))
    .mockResolvedValueOnce({ data: terminalBatch() });
  const { unmount } = renderHook(() => useSettlementPolling(requestFixture, false), { wrapper: wrapperFor(cache) });

  await act(() => vi.advanceTimersByTimeAsync(4999)); expect(mocks.request).not.toHaveBeenCalled();
  await act(() => vi.advanceTimersByTimeAsync(1)); expect(mocks.request).toHaveBeenCalledTimes(1);
  expect(mocks.request).toHaveBeenLastCalledWith(`/api/batches/${batchFixture.uuid}`, expect.objectContaining({ notify: false }));
  await act(() => vi.advanceTimersByTimeAsync(15000)); expect(mocks.request).toHaveBeenCalledTimes(1);
  await act(async () => { resolvePoll?.({ data: { ...pendingBatch, progressVersion: '1' } }); });

  hidden = true; act(() => document.dispatchEvent(new Event('visibilitychange')));
  await act(() => vi.advanceTimersByTimeAsync(15000)); expect(mocks.request).toHaveBeenCalledTimes(1);
  hidden = false; act(() => document.dispatchEvent(new Event('visibilitychange')));
  expect(mocks.request).toHaveBeenCalledTimes(2);
  await act(async () => { await Promise.resolve(); });
  await act(() => vi.advanceTimersByTimeAsync(15000)); expect(mocks.request).toHaveBeenCalledTimes(2);
  expect(cache.getQueryData(['batches', 'detail', batchFixture.uuid])).toMatchObject({ status: 'FAILED' });
  unmount(); cache.clear();
});

test('não consulta títulos quando progressVersion permanece igual', async () => {
  vi.useFakeTimers(); vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  const cache = makeCache();
  mocks.request.mockResolvedValue({ data: pendingBatch });
  const { unmount } = renderHook(() => useSettlementPolling(requestFixture, true), { wrapper: wrapperFor(cache) });

  await act(() => vi.advanceTimersByTimeAsync(5000));
  expect(mocks.request).toHaveBeenCalledTimes(1);
  expect(mocks.request).toHaveBeenCalledWith(`/api/batches/${batchFixture.uuid}`, expect.any(Object));
  expect(mocks.request).not.toHaveBeenCalledWith(itemsPath, expect.any(Object));
  unmount(); cache.clear();
});

test('mudança de versão consulta uma vez a página visível e preserva paginação da URL', async () => {
  vi.useFakeTimers(); vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  const cache = makeCache();
  mocks.request.mockImplementation((path: string) => path === itemsPath
    ? Promise.resolve({ data: receivablePage })
    : Promise.resolve({ data: { ...pendingBatch, progressVersion: '2' } }));
  const entry = `/lotes/${batchFixture.uuid}?page=3&size=5`;
  const { unmount } = renderHook(() => useSettlementPolling(requestFixture, true), { wrapper: wrapperFor(cache, entry) });

  await act(() => vi.advanceTimersByTimeAsync(5000));
  expect(mocks.request).toHaveBeenCalledTimes(2);
  expect(mocks.request).toHaveBeenNthCalledWith(2, itemsPath, expect.objectContaining({ query: { page: 3, size: 5 }, notify: false }));
  expect(cache.getQueryData(['batches', 'items', batchFixture.uuid, { page: 3, size: 5 }])).toEqual(receivablePage);
  unmount(); cache.clear();
});

test('consulta página de títulos também no término, mesmo sem mudança adicional de versão', async () => {
  vi.useFakeTimers(); vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  const cache = makeCache();
  const firstPage = { ...receivablePage, page: 1, size: 20, totalPages: 1 };
  mocks.request.mockImplementation((path: string) => path === itemsPath
    ? Promise.resolve({ data: firstPage })
    : Promise.resolve({ data: terminalBatch() }));
  const { unmount } = renderHook(() => useSettlementPolling(requestFixture, true), { wrapper: wrapperFor(cache) });

  await act(() => vi.advanceTimersByTimeAsync(5000));
  expect(mocks.request).toHaveBeenCalledTimes(2);
  expect(mocks.request).toHaveBeenNthCalledWith(2, itemsPath, expect.objectContaining({ query: { page: 1, size: 20 } }));
  expect(cache.getQueryData(['batches', 'items', batchFixture.uuid, { page: 1, size: 20 }])).toEqual(firstPage);
  unmount(); cache.clear();
});

test('não consulta a página quando a aba de títulos está inativa', async () => {
  vi.useFakeTimers(); vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  const cache = makeCache();
  mocks.request.mockResolvedValue({ data: { ...pendingBatch, progressVersion: '4' } });
  const { unmount } = renderHook(() => useSettlementPolling(requestFixture, false), { wrapper: wrapperFor(cache, `/lotes/${batchFixture.uuid}?tab=audit&page=4`) });

  await act(() => vi.advanceTimersByTimeAsync(5000));
  expect(mocks.request).toHaveBeenCalledTimes(1);
  expect(cache.getQueryCache().find({ queryKey: ['batches', 'items', batchFixture.uuid, { page: 4, size: 20 }], exact: true })).toBeUndefined();
  unmount(); cache.clear();
});

test('suspende polling quando a sessão deixa de estar válida', async () => {
  vi.useFakeTimers(); vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  const cache = makeCache();
  mocks.request.mockResolvedValue({ data: pendingBatch });
  const { rerender, unmount } = renderHook(() => useSettlementPolling(requestFixture), { wrapper: wrapperFor(cache) });
  await act(() => vi.advanceTimersByTimeAsync(5000)); expect(mocks.request).toHaveBeenCalledTimes(1);

  mocks.session.expired = true; rerender();
  await act(() => vi.advanceTimersByTimeAsync(20000)); expect(mocks.request).toHaveBeenCalledTimes(1);
  unmount(); cache.clear();
});
