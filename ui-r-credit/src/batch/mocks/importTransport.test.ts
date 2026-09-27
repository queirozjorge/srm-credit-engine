// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { server } from '../../common/testing/server';
import { createDemoHandlers } from '../../app/mocks/handlers';
import { createApiClient } from '../../common/http/client';
import { batchCreatedSchema, batchDetailSchema, batchPageSchema, previewSchema } from '../services/contracts';
import { sampleFile } from './importSamples';
import { importBody } from '../services/importBatch';
const api = createApiClient({ headers: () => ({ 'X-Demo-Subject': 'operador-demo' }) });
beforeEach(() => {
  vi.stubGlobal('location', new URL('http://localhost/'));
  server.use(...createDemoHandlers());
  const interceptedFetch = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => interceptedFetch(typeof input === 'string' ? new URL(input, 'http://localhost') : input, init));
});
afterEach(() => vi.unstubAllGlobals());
test.each(['CSV', 'CNAB'] as const)('%s usa arquivo original; prévia não persiste e cadastro revalida duplicidade', async format => {
  const file = sampleFile(format);
  const preview = await api.request('/api/batches/preview', { method: 'POST', schema: previewSchema, body: importBody(file, format) });
  expect(preview.data.itemCount).toBe(2);
  expect((await api.request('/api/batches', { schema: batchPageSchema })).data.totalItems).toBe(1);
  const created = await api.request('/api/batches', { method: 'POST', schema: batchCreatedSchema, statuses: [201], body: importBody(file, format, { 0: 'USD' }) });
  const detail = await api.request(`/api/batches/${created.data.uuid}`, { schema: batchDetailSchema });
  expect(detail.data).toMatchObject({ source: format, itemCount: 2, status: 'READY', activeRequest: null });
  await expect(api.request('/api/batches', { method: 'POST', schema: batchCreatedSchema, statuses: [201], body: importBody(file, format) })).rejects.toMatchObject({ status: 409 });
});
test('arquivo inválido não permite importar linhas válidas; índices CNAB inválidos são rejeitados', async () => {
  await expect(api.request('/api/batches', { method: 'POST', schema: batchCreatedSchema, statuses: [201], body: importBody(sampleFile('CSV', true), 'CSV') })).rejects.toMatchObject({ status: 422 });
  await expect(api.request('/api/batches', { method: 'POST', schema: batchCreatedSchema, statuses: [201], body: importBody(sampleFile('CNAB'), 'CNAB', { 99: 'USD' }) })).rejects.toMatchObject({ status: 422 });
  expect((await api.request('/api/batches', { schema: batchPageSchema })).data.totalItems).toBe(1);
});
