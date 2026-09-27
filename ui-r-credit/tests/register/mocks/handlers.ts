import { http, HttpResponse } from 'msw';
import { authorize, paginated, failure, readBody, demoText, demoTime, demoUuid } from '../../common/testing/demo';
import { createAssignorSchema, editAssignorSchema } from '../../../src/register/services/contracts';
import { assignorFixture } from './fixtures';
export function createRegisterStore() { return { rows: [structuredClone(assignorFixture)] }; }
export function createRegisterHandlers(store = createRegisterStore()) {
  const rows = store.rows; let nextId = 100;
  return [
    http.get('/api/assignors', ({ request }) => {
      const denied = authorize(request); if (denied) return denied;
      const params = new URL(request.url).searchParams;
      if (params.has('activeOnly') && !['true', 'false'].includes(params.get('activeOnly') ?? '')) return failure(400, 'REQUISICAO_INVALIDA');
      const q = params.get('q')?.trim().toLowerCase() ?? '';
      return paginated(request, rows.filter(r => (!q || r.name.toLowerCase().includes(q) || r.documentNumber.toLowerCase().includes(q)) && (params.get('activeOnly') !== 'true' || !r.deleted)));
    }),
    http.get('/api/assignors/:uuid', ({ request, params }) => {
      const denied = authorize(request); if (denied) return denied;
      const row = rows.find(r => r.uuid === params.uuid); return row ? HttpResponse.json(row) : failure(404, 'RECURSO_NAO_ENCONTRADO', demoText.missing);
    }),
    http.post('/api/assignors', async ({ request }) => {
      const denied = authorize(request, 'assignorWrite'); if (denied) return denied;
      const parsed = await readBody(request, createAssignorSchema); if (!parsed.success) return failure(400, 'REQUISICAO_INVALIDA');
      if (rows.some(r => r.documentNumber === parsed.data.documentNumber)) return failure(409, 'DOCUMENTO_DUPLICADO', demoText.duplicate);
      const uuid = demoUuid(nextId++);
      rows.unshift({ ...assignorFixture, ...parsed.data, uuid });
      return HttpResponse.json({ uuid }, { status: 201, headers: { Location: `/api/assignors/${uuid}` } });
    }),
    http.patch('/api/assignors/:uuid', async ({ request, params }) => {
      const denied = authorize(request, 'assignorWrite'); if (denied) return denied;
      const row = rows.find(r => r.uuid === params.uuid); if (!row) return failure(404, 'RECURSO_NAO_ENCONTRADO', demoText.missing);
      const parsed = await readBody(request, editAssignorSchema); if (!parsed.success) return failure(400, 'REQUISICAO_INVALIDA');
      if (parsed.data.version !== row.version) return failure(409, 'VERSAO_DESATUALIZADA', demoText.conflict);
      row.name = parsed.data.name; row.version = String(BigInt(row.version) + 1n); row.updatedAt = demoTime;
      return new HttpResponse(null, { status: 204 });
    }),
  ];
}
