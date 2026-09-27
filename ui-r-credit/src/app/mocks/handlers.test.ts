import { z } from 'zod';
import { beforeEach, expect, test } from 'vitest';
import { server } from '../../common/testing/server';
import { createDemoHandlers } from './handlers';
import { createApiClient } from '../../common/http/client';
import { created, pageOf } from '../../common/http/contracts';
import { assignorSchema, assignorPageSchema } from '../../register/services/contracts';
import { batchDetailSchema, batchPageSchema } from '../../batch/services/contracts';
import { receivableSchema } from '../../batch/services/receivableContracts';
import { exchangeViewSchema, referenceSchema, proposalSchema } from '../../exchange/services/contracts';
import { dashboardSchema } from '../../dashboard/services/contracts';
import { simulationSchema } from '../../pricing/services/contracts';
import { requestSchema, statementPageSchema } from '../../settlement/services/contracts';
import { demoProfiles } from '../../auth/mocks/profiles';
import { demoUuid } from '../../common/testing/demo';
beforeEach(() => server.use(...createDemoHandlers()));
const api = createApiClient({ headers: () => ({ 'X-Demo-Subject': demoProfiles.operator.subject }) });
test('fixtures de todos os domínios respeitam schemas e paginação', async () => {
  const contracts: [string, z.ZodType][] = [
    ['/api/assignors', assignorPageSchema], ['/api/assignors/' + demoUuid(1), assignorSchema],
    ['/api/batches', batchPageSchema], ['/api/batches/' + demoUuid(2), batchDetailSchema],
    [`/api/batches/${demoUuid(2)}/receivables`, pageOf(receivableSchema)],
    ['/api/exchange', exchangeViewSchema], ['/api/exchange/reference', referenceSchema],
    ['/api/exchange/proposals/' + demoUuid(6), proposalSchema], ['/api/dashboard', dashboardSchema],
    [`/api/batches/${demoUuid(2)}/settlements`, pageOf(requestSchema)], ['/api/settlements/items', statementPageSchema],
  ];
  for (const [path, schema] of contracts) await expect(api.request(path, { schema })).resolves.toMatchObject({ status: 200 });
  await expect(api.request('/api/simulations', { schema: simulationSchema, method: 'POST', body: { batchUuid: demoUuid(2) } })).resolves.toMatchObject({ status: 200 });
});
test('vazio e página fora do total são 200; página inválida e recurso inexistente são erros', async () => {
  expect((await api.request('/api/assignors', { schema: assignorPageSchema, query: { page: 3 } })).data.items).toEqual([]);
  expect((await api.request('/api/assignors', { schema: assignorPageSchema, query: { q: 'nada' } })).data.totalItems).toBe(0);
  await expect(api.request('/api/assignors', { schema: assignorPageSchema, query: { page: 0 } })).rejects.toMatchObject({ status: 400 });
  await expect(api.request('/api/assignors/' + demoUuid(99), { schema: assignorSchema })).rejects.toMatchObject({ status: 404 });
  await expect(api.request('/api/unknown', { schema: z.unknown() })).rejects.toMatchObject({ status: 404 });
});
test('cadastro e PATCH preservam documento; concorrência falha sem sucesso fictício', async () => {
  const result = await api.request('/api/assignors', { schema: created, statuses: [201], method: 'POST', body: { name: 'Teste', documentNumber: '11444777000161' } });
  const path = `/api/assignors/${result.data.uuid}`;
  expect(result.location).toBe(path);
  await api.request(path, { schema: z.undefined(), statuses: [204], method: 'PATCH', body: { name: 'Novo', version: '0' } });
  expect((await api.request(path, { schema: assignorSchema })).data).toMatchObject({ name: 'Novo', documentNumber: '11444777000161', version: '1' });
  await expect(api.request(path, { schema: z.undefined(), statuses: [204], method: 'PATCH', body: { name: 'Antigo', version: '0' } })).rejects.toMatchObject({ status: 409 });
  await expect(api.request(path, { schema: z.undefined(), statuses: [204], method: 'PATCH', body: { name: 'Antigo', version: '1', documentNumber: '11444777000161' } })).rejects.toMatchObject({ status: 400 });
});
test('handlers são isolados por cenário e exigem perfil para APIs demonstrativas', async () => {
  expect((await api.request('/api/assignors', { schema: assignorPageSchema })).data.totalItems).toBe(1);
  await expect(createApiClient().request('/api/assignors', { schema: assignorPageSchema })).rejects.toMatchObject({ status: 401 });
  const manager = createApiClient({ headers: () => ({ 'X-Demo-Subject': demoProfiles.manager.subject }) });
  await expect(manager.request('/api/simulations', { schema: simulationSchema, method: 'POST', body: { batchUuid: demoUuid(2) } })).rejects.toMatchObject({ status: 403 });
});
