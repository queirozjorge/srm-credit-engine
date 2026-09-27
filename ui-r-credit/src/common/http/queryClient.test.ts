import { focusManager, onlineManager, QueryObserver } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { afterEach, expect, test, vi } from 'vitest';
import { server } from '../testing/server';
import { createQueryClient } from './queryClient';

const clients: ReturnType<typeof createQueryClient>[] = [];

function mountedClient() {
  const client = createQueryClient();
  client.mount();
  clients.push(client);
  return client;
}

afterEach(() => {
  for (const client of clients.splice(0)) {
    client.unmount();
    client.clear();
  }
  focusManager.setFocused(undefined);
  onlineManager.setOnline(true);
  vi.useRealTimers();
});

test('deduplica consultas simultâneas e reutiliza dados recentes', async () => {
  let requests = 0;
  server.use(http.get('http://localhost/query-test', () => {
    requests += 1;
    return HttpResponse.json({ value: '100.00' });
  }));
  const client = mountedClient();
  const options = {
    queryKey: ['foundation'],
    queryFn: async () => {
      const response = await fetch('http://localhost/query-test');
      return response.text();
    },
  };

  const [first, second] = await Promise.all([
    client.fetchQuery(options), client.fetchQuery(options),
  ]);
  expect(first).toBe(second);
  await client.fetchQuery(options);
  expect(requests).toBe(1);
});

test('não repete consultas nem mutações que falharam', async () => {
  vi.useFakeTimers();
  const client = mountedClient();
  const queryFn = vi.fn().mockRejectedValue(new Error('Falha de consulta'));
  const mutationFn = vi.fn().mockRejectedValue(new Error('Falha de envio'));
  const query = client.fetchQuery({ queryKey: ['failure'], queryFn });
  const mutation = client.getMutationCache().build(client, { mutationFn }).execute(undefined);
  const outcomes = Promise.allSettled([query, mutation]);

  await vi.advanceTimersByTimeAsync(15_000);
  expect((await outcomes).map((outcome) => outcome.status)).toEqual(['rejected', 'rejected']);
  expect(queryFn).toHaveBeenCalledTimes(1);
  expect(mutationFn).toHaveBeenCalledTimes(1);
});

test('foco e reconexão não atualizam consultas; atualização explícita continua disponível', async () => {
  vi.useFakeTimers();
  const client = mountedClient();
  const queryFn = vi.fn().mockResolvedValue('100.00');
  const observer = new QueryObserver(client, {
    queryKey: ['events'], queryFn, staleTime: 0,
  });
  const unsubscribe = observer.subscribe(() => undefined);

  try {
    await vi.advanceTimersByTimeAsync(1);
    expect(observer.getCurrentResult().status).toBe('success');
    focusManager.setFocused(false);
    onlineManager.setOnline(false);
    focusManager.setFocused(true);
    onlineManager.setOnline(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(queryFn).toHaveBeenCalledTimes(1);

    await observer.refetch();
    expect(queryFn).toHaveBeenCalledTimes(2);
  } finally {
    unsubscribe();
  }
});
