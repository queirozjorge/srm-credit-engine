import { beforeEach, expect, test } from 'vitest';
import { server } from '../../common/testing/server';
import { createDemoHandlers } from '../../app/mocks/handlers';
import { createApiClient } from '../../common/http/client';
import { created } from '../../common/http/contracts';
import { batchCreatedSchema, batchDetailSchema, batchPageSchema } from '../services/contracts';
import { receivableFixture } from './fixtures';
import { inputOf } from '../services/manualBatch';
const api = createApiClient({ headers: () => ({ 'X-Demo-Subject': 'operador-demo' }) });
const item = inputOf({ ...receivableFixture, externalReference: '000099', dueDate: '2099-12-31' });
beforeEach(() => server.use(...createDemoHandlers()));
test('rejeição é integral; duplicidade entre lotes e papel gestor são verificados', async () => {
  await expect(api.request('/api/batches', { method: 'POST', statuses: [201], schema: batchCreatedSchema, body: { items: [item, { ...item, externalReference: 'DEMO-001' }] } })).rejects.toMatchObject({ status: 409 });
  const listing = await api.request('/api/batches', { schema: batchPageSchema });
  expect(listing.data.totalItems).toBe(1);
  const manager = createApiClient({ headers: () => ({ 'X-Demo-Subject': 'gestor-demo' }) });
  await expect(manager.request('/api/batches', { method: 'POST', statuses: [201], schema: batchCreatedSchema, body: { items: [item] } })).rejects.toMatchObject({ status: 403 });
});
test('cedente recém-cadastrado pode compor lote misto; READY sem solicitação', async () => {
  const assignor = await api.request('/api/assignors', { method: 'POST', statuses: [201], schema: created, body: { name: 'Outro cedente', documentNumber: '11444777000161' } });
  const result = await api.request('/api/batches', { method: 'POST', statuses: [201], schema: batchCreatedSchema,
    body: { items: [item, { ...item, assignorUuid: assignor.data.uuid, paymentCurrency: 'USD' }] } });
  const detail = await api.request(`/api/batches/${result.data.uuid}`, { schema: batchDetailSchema });
  expect(detail.data).toMatchObject({ status: 'READY', itemCount: 2, assignorCount: 2, soleAssignor: null, faceValueBrl: '2000.00', activeRequest: null });
  expect(result.location).toBe(`/api/batches/${result.data.uuid}`);
});
