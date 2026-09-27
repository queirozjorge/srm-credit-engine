import { writeFile } from 'node:fs/promises';
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { z } from 'zod';
import { generateDataset } from '../tests/load/dataset';
import { pageOf } from '../src/common/http/contracts';
import { batchDetailSchema } from '../src/batch/services/contracts';
import { auditEventSchema, requestItemSchema, requestSchema } from '../src/settlement/services/contracts';
import { translations, locale } from '../src/i18n/pt-BR';
import { confirmSettlement, importBatch, prepareSettlement, registerAssignor, signIn, verifySettled } from './load/ui';

const text = translations[locale];
const tokenClaims = z.object({ iss: z.string(), sub: z.string(), realm_access: z.object({ roles: z.array(z.string()) }) });
const secondUsername = process.env.LOAD_OPERATOR2_USERNAME;
const secondPassword = process.env.LOAD_OPERATOR2_PASSWORD;
test.skip(!secondUsername || !secondPassword, 'Requer LOAD_OPERATOR2_USERNAME/PASSWORD de outra conta OPERADOR; duas sessões da mesma identidade não comprovam concorrência entre operadores.');

function captureAuthorization(page: Page) {
  let authorization = '';
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/')) authorization = request.headers().authorization ?? authorization;
  });
  return () => {
    if (!authorization.startsWith('Bearer ')) throw new Error('Sessão sem access token autenticado.');
    return authorization;
  };
}

async function read(context: BrowserContext, authorization: string, path: string) {
  const response = await context.request.get(`/api${path}`, { headers: { Authorization: authorization } });
  expect(response.status(), `Consulta de reconciliação ${path}`).toBe(200);
  return response.json() as Promise<unknown>;
}

test('dois operadores e chaves distintas mantêm uma liquidação por título', async ({ browser, baseURL }, info) => {
  const contexts: BrowserContext[] = [];
  const seed = `race-${Date.now()}`;
  const calculationDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const data = generateDataset({ seed, calculationDate, itemCount: 20, batchNumber: 0, assignorCount: 2 });
  const file = info.outputPath('race.csv');
  await writeFile(file, data.csv);
  try {
    for (let i = 0; i < 2; i++) contexts.push(await browser.newContext({ baseURL, ignoreHTTPSErrors: true,
      locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', viewport: { width: 1366, height: 900 } }));
    const pages = await Promise.all(contexts.map(context => context.newPage()));
    const credentials = [undefined, { username: secondUsername!, password: secondPassword! }];
    const tokens = pages.map(captureAuthorization);
    for (const [index, page] of pages.entries()) await signIn(page, 'operator', credentials[index]);
    // Compare issuer/sub from tokens already accepted by the engine; never persist bearer values.
    const actors = tokens.map(get => {
      const claims = tokenClaims.parse(JSON.parse(Buffer.from(get().split('.')[1]!, 'base64url').toString('utf8')));
      expect(claims.realm_access.roles).toContain('OPERADOR');
      return { issuer: claims.iss, subject: claims.sub };
    });
    expect(actors[0]).not.toEqual(actors[1]);
    for (const assignor of data.assignors) await registerAssignor(pages[0]!, assignor);
    const batchUuid = await importBatch(pages[0]!, file, 'CSV', data.items.length);
    const second = pages[1]!;
    await second.locator('#main-navigation').getByRole('link', { name: text.batch.list.title, exact: true }).click();
    await second.getByRole('searchbox', { name: text.batch.search, exact: true }).fill(batchUuid);
    await second.getByRole('button', { name: text.batch.searchAction, exact: true }).click();
    await second.locator(`#page-content a[href="/lotes/${batchUuid}"]`).click();
    for (const page of pages) await prepareSettlement(page);
    const responses = await Promise.all(pages.map(page => confirmSettlement(page, batchUuid)));
    const keys = responses.map(response => response.request().headers()['idempotency-key']);
    expect(keys.every(key => typeof key === 'string' && key.length > 0)).toBe(true);
    expect(new Set(keys).size).toBe(2);
    expect(responses.map(response => response.status()).sort()).toEqual([202, 409]);
    const winner = responses.findIndex(response => response.status() === 202);
    const accepted = requestSchema.parse(await responses[winner]!.json());
    expect(accepted.requestedBy).toEqual(actors[winner]);
    await verifySettled(pages[winner]!);
    const authorization = tokens[winner]!();
    const context = contexts[winner]!;
    const detail = batchDetailSchema.parse(await read(context, authorization, `/batches/${batchUuid}`));
    const requests = pageOf(requestSchema).parse(await read(context, authorization, `/batches/${batchUuid}/settlements?page=1&size=100`));
    const attempts = pageOf(requestItemSchema).parse(await read(context, authorization, `/settlement-requests/${accepted.uuid}/items?page=1&size=100`));
    const audit = pageOf(auditEventSchema).parse(await read(context, authorization, `/batches/${batchUuid}/audit-events?page=1&size=100`));
    expect(requests.totalItems).toBe(1);
    expect(attempts.totalItems).toBe(data.items.length);
    expect(attempts.items.every(item => item.status === 'SETTLED' && item.attemptNumber === 1 && item.result !== null)).toBe(true);
    expect(new Set(attempts.items.map(item => item.receivable.uuid)).size).toBe(data.items.length);
    expect(new Set(attempts.items.map(item => item.result?.uuid)).size).toBe(data.items.length);
    expect(detail.counts).toEqual({ ready: 0, pending: 0, settled: data.items.length, failed: 0 });
    expect(detail.settledTotals.faceValueBrl).toBe(data.manifest.faceValueBrl);
    expect(audit.totalItems).toBeLessThanOrEqual(100);
    const successes = audit.items.filter(item => item.eventType === 'RECEIVABLE_SETTLED');
    expect(successes).toHaveLength(data.items.length);
    expect(new Set(successes.map(item => item.receivableUuid)).size).toBe(data.items.length);
    await info.attach('race-result', { body: JSON.stringify({ seed, batchUuid, requestUuid: accepted.uuid, actors,
      initialStatuses: responses.map(response => response.status()), distinctKeys: true,
      requestCount: requests.totalItems, attemptCount: attempts.totalItems, settlementCount: data.items.length,
      successAuditCount: successes.length, counts: detail.counts }, null, 2), contentType: 'application/json' });
  } finally { await Promise.all(contexts.map(context => context.close())); }
});
