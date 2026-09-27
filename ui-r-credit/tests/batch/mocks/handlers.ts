import { readImport } from './importTransport';
import { inputOf } from '../../../src/batch/services/manualBatch';
import { assignorFixture } from '../../register/mocks/fixtures';
import type { Assignor } from '../../../src/register/services/contracts';
import { demoProfiles } from '../../auth/mocks/profiles';
import { readBody } from '../../common/testing/demo';
import { identityOf, totalFace, validateManual } from '../../../src/batch/services/manualBatch';
import { locale, translations } from '../../pt-BR';
import { http, HttpResponse } from 'msw';
import { authorize, paginated, failure, demoText } from '../../common/testing/demo';
import { batchFixture, receivableFixture } from './fixtures';
import { batchStatus, batchSummarySchema, createBatchSchema, type BatchDetail } from '../../../src/batch/services/contracts';
import type { z } from 'zod';
import type { receivableSchema } from '../../../src/batch/services/receivableContracts';
export type Scenario = { batch: BatchDetail; items: z.infer<typeof receivableSchema>[] };
export function createBatchStore(): Scenario[] { return structuredClone([{ batch: batchFixture, items: [receivableFixture] }]); }
export function createBatchHandlers(seed: Scenario[] = [{ batch: batchFixture, items: [receivableFixture] }],
  findAssignor: (id: string) => Assignor | undefined = id => id === assignorFixture.uuid ? assignorFixture : undefined, shared?: Scenario[]) {
  const scenarios = shared ?? structuredClone(seed);
  return [
    http.post('/api/batches/preview', async ({ request }) => {
      const denied = authorize(request, 'batchWrite'); if (denied) return denied;
      const parsed = await readImport(request, true);
      return 'error' in parsed ? parsed.error : HttpResponse.json(parsed.preview);
    }),
    http.post('/api/batches', async ({ request }) => {
      const denied = authorize(request, 'batchWrite'); if (denied) return denied;
      const imported = request.headers.get('Content-Type')?.startsWith('multipart/form-data') ? await readImport(request, false) : null;
      if (imported && 'error' in imported) return imported.error;
      const parsed = imported ? createBatchSchema.safeParse({ items: imported.preview.items.map(inputOf) }) : await readBody(request, createBatchSchema);
      if (!parsed.success) return failure(422, 'LOTE_INVALIDO');
      const invalid = validateManual(parsed.data.items);
      if (invalid) return failure(422, 'LOTE_INVALIDO', translations[locale].batch.manual.errors[invalid]);
      const identities = new Set(scenarios.flatMap(row => row.items.map(identityOf)));
      if (parsed.data.items.some(item => identities.has(identityOf(item)))) return failure(409, 'TITULO_DUPLICADO', translations[locale].batch.manual.errors.duplicate);
      const assignors = parsed.data.items.map(item => findAssignor(item.assignorUuid));
      if (assignors.some(row => !row || row.deleted)) return failure(422, 'CEDENTE_INDISPONIVEL', translations[locale].batch.manual.fields.assignorUuid);
      const uuid = crypto.randomUUID(); const ids = new Set(parsed.data.items.map(item => item.assignorUuid));
      const first = assignors[0];
      const actor = Object.values(demoProfiles).find(profile => profile.subject === (request.headers.get('Authorization')?.replace(/^Bearer /, '') ?? request.headers.get('X-Demo-Subject')))!;
      const items = parsed.data.items.map((item, index) => ({ ...item, externalReference: item.externalReference.trim(), uuid: crypto.randomUUID(), assignorName: assignors[index]!.name, processing: structuredClone(receivableFixture.processing) }));
      const batch: BatchDetail = { uuid, source: imported?.preview.source ?? 'FORM', status: 'READY', itemCount: items.length, counts: { ready: items.length, pending: 0, settled: 0, failed: 0 }, assignorCount: ids.size,
        soleAssignor: ids.size === 1 && first ? { uuid: first.uuid, name: first.name } : null,
        representativeExternalReference: [...items].map(item => item.externalReference).sort((left, right) => left < right ? -1 : left > right ? 1 : 0)[0]!,
        faceValueBrl: totalFace(items), registeredAt: new Date().toISOString(), createdBy: { issuer: actor.issuer, subject: actor.subject }, activeRequest: null, settledTotals: { faceValueBrl: '0.00', presentValueBrl: '0.00', discountBrl: '0.00', paymentBrl: '0.00', paymentUsd: '0.00' }, progressVersion: '0' };
      scenarios.unshift({ batch, items });
      return HttpResponse.json({ uuid, status: 'READY' }, { status: 201, headers: { Location: `/api/batches/${uuid}` } });
    }),
    http.get('/api/batches', ({ request }) => {
      const denied = authorize(request); if (denied) return denied;
      const params = new URL(request.url).searchParams; const status = params.get('status');
      if (status && !batchStatus.safeParse(status).success) return failure(400, 'REQUISICAO_INVALIDA');
      const q = params.get('q')?.trim().toLocaleLowerCase('pt-BR') ?? '';
      const rows = scenarios.filter(({ batch, items }) => (!status || batch.status === status) && (!q || batch.uuid.includes(q)
        || items.some(item => item.assignorName.toLocaleLowerCase('pt-BR').includes(q)
          || item.externalReference.toLocaleLowerCase('pt-BR').includes(q))));
      return paginated(request, rows.map(({ batch, items }) => batchSummarySchema.parse({ ...batch,
        representativeExternalReference: [...items].map(item => item.externalReference)
          .sort((left, right) => left < right ? -1 : left > right ? 1 : 0)[0]! })));
    }),
    http.get('/api/batches/:uuid', ({ request, params }) => {
      const denied = authorize(request); if (denied) return denied;
      const row = scenarios.find(({ batch }) => batch.uuid === params.uuid);
      return row ? HttpResponse.json(row.batch) : failure(404, 'RECURSO_NAO_ENCONTRADO', demoText.missing);
    }),
    http.get('/api/batches/:uuid/receivables', ({ request, params }) => {
      const denied = authorize(request); if (denied) return denied;
      const row = scenarios.find(({ batch }) => batch.uuid === params.uuid);
      return row ? paginated(request, [...row.items].sort((a, b) => a.uuid.localeCompare(b.uuid))) : failure(404, 'RECURSO_NAO_ENCONTRADO', demoText.missing);
    }),
  ];
}
export const batchHandlers = createBatchHandlers();
