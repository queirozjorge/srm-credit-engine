import { http, HttpResponse, delay } from 'msw';
import { z } from 'zod';
import { expect, test, vi } from 'vitest';
import { server } from '../../../tests/common/testing/server';
import { createApiClient } from './client';
import { scenario } from '../../../tests/common/testing/demo';
import { createSession } from '../../auth/services/session';
import { demoProfiles } from '../../../tests/auth/mocks/profiles';
const schema = z.object({ value: z.string() });
test('valida resposta, query e Bearer sem enviar credenciais em URL', async () => {
  server.use(http.get('/api/check', ({ request }) => {
    expect(request.headers.get('Authorization')).toBe('Bearer private');
    expect(new URL(request.url).searchParams.get('q')).toBe('a & b');
    expect(request.url).not.toContain('private');
    return HttpResponse.json({ value: 'ok' });
  }));
  expect((await createApiClient({ token: () => 'private' }).request('/api/check', { schema, query: { q: 'a & b', unused: undefined } })).data.value).toBe('ok');
});
test('204 não tenta interpretar JSON; preserva Idempotency-Key em repetição explícita', async () => {
  const keys: (string | null)[] = [];
  server.use(http.post('/api/check', ({ request }) => { keys.push(request.headers.get('Idempotency-Key')); return new HttpResponse(null, { status: 204 }); }));
  const api = createApiClient();
  for (let i = 0; i < 2; i++) await api.request('/api/check', { schema: z.undefined(), method: 'POST', statuses: [204], idempotencyKey: 'same-attempt' });
  expect(keys).toEqual(['same-attempt', 'same-attempt']);
});
test.each([400, 401, 403, 404, 409, 413, 422, 429, 500, 502, 503, 504])('preserva HTTP %i como falha, sem retry', async status => {
  const onError = vi.fn(); const onUnauthorized = vi.fn(); let calls = 0;
  server.use(http.get('/api/check', () => { calls++; return scenario(status); }));
  await expect(createApiClient({ onError, onUnauthorized }).request('/api/check', { schema })).rejects.toMatchObject({ status });
  expect(calls).toBe(1); expect(onError).toHaveBeenCalledTimes(1); expect(onUnauthorized).toHaveBeenCalledTimes(status === 401 ? 1 : 0);
});
test.each(['invalid', 'network'] as const)('falha %s nunca vira sucesso', async kind => {
  server.use(http.get('/api/check', () => scenario(kind)));
  await expect(createApiClient().request('/api/check', { schema })).rejects.toMatchObject({ code: kind === 'invalid' ? 'INVALID_RESPONSE' : 'NETWORK_ERROR' });
});
test('timeout, cancelamento e troca de identidade descartam respostas antigas', async () => {
  server.use(http.get('/api/check', async () => { await delay(80); return HttpResponse.json({ value: 'old' }); }));
  const onError = vi.fn(); const session = createSession(); session.signIn(demoProfiles.operator, demoProfiles.operator.subject);
  const api = createApiClient({ sessionSignal: session.signal, onError });
  await expect(api.request('/api/check', { schema, timeoutMs: 5 })).rejects.toMatchObject({ code: 'TIMEOUT' });
  onError.mockClear(); const pending = api.request('/api/check', { schema });
  session.signIn(demoProfiles.manager, demoProfiles.manager.subject);
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' }); expect(onError).not.toHaveBeenCalled();
  const controller = new AbortController(); controller.abort();
  await expect(api.request('/api/check', { schema, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
});
test('upload mantém boundary do navegador e erro 500 não expõe diagnóstico', async () => {
  server.use(http.post('/api/check', async ({ request }) => {
    expect(request.headers.get('Content-Type')).toMatch(/^multipart\/form-data; boundary=/);
    expect((await request.formData()).get('format')).toBe('CSV');
    return HttpResponse.json({ code: 'ERRO_INTERNO', message: 'stack trace secret', details: [{ code: 'X', message: 'secret' }] }, { status: 500 });
  }));
  const body = new FormData(); body.set('format', 'CSV');
  await expect(createApiClient().request('/api/check', { schema, method: 'POST', body })).rejects.toMatchObject({ message: 'Não foi possível concluir a operação.', details: [] });
});
test('rejeita destino externo antes de enviar Bearer', async () => {
  await expect(createApiClient().request('https://example.com/api/check', { schema })).rejects.toThrow('Caminho');
});
