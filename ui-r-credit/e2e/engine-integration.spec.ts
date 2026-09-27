import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import { created, pageOf } from '../src/common/http/contracts';
import { assignorSchema } from '../src/register/services/contracts';
import { batchCreatedSchema, batchDetailSchema, previewSchema } from '../src/batch/services/contracts';
import { receivableSchema } from '../src/batch/services/receivableContracts';
import { simulationSchema } from '../src/pricing/services/contracts';
import { requestSchema, requestItemSchema, auditEventSchema, statementPageSchema } from '../src/settlement/services/contracts';
import { dashboardSchema } from '../src/dashboard/services/contracts';
import { exchangeViewSchema, proposalSchema } from '../src/exchange/services/contracts';
import { translations, locale } from '../src/i18n/pt-BR';
const text = translations[locale];

// No intercepted business requests, injected session, fixture result or direct database write.
async function signIn(page: Page, profile: 'operador' | 'gestor') {
  const password = process.env[profile === 'operador' ? 'KEYCLOAK_OPERATOR_PASSWORD' : 'KEYCLOAK_MANAGER_PASSWORD'];
  if (!password) throw new Error(`Credencial de teste ausente para ${profile}.`);
  let authorization = '';
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/')) authorization = request.headers().authorization ?? authorization;
  });
  await page.goto('/dashboard');
  await page.getByRole('button', { name: text.auth.login, exact: true }).click();
  await page.locator('input[name="username"]').fill(profile);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('input[type="submit"],button[type="submit"]').first().click();
  const profileUpdate = page.getByRole('heading', { name: 'Update Account Information', exact: true });
  if (await profileUpdate.isVisible().catch(() => false)) {
    await page.getByRole('textbox', { name: 'Email', exact: true }).fill(`${profile}@srm-credit.local`);
    await page.getByRole('textbox', { name: 'First name', exact: true }).fill(profile === 'operador' ? 'Operador' : 'Gestor');
    await page.getByRole('textbox', { name: 'Last name', exact: true }).fill('Homologação');
    await page.getByRole('button', { name: 'Submit', exact: true }).click();
  }
  await expect(page.getByRole('heading', { name: text.dashboard.title, exact: true })).toBeVisible();
  await expect.poll(() => authorization.startsWith('Bearer ')).toBe(true);
  return () => authorization;
}

async function api(page: Page, authorization: string, path: string, method = 'GET', body?: unknown, key?: string) {
  return page.evaluate(async input => {
    const response = await fetch(`/api${input.path}`, {
      method: input.method,
      headers: { Authorization: input.authorization, ...(input.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(input.key ? { 'Idempotency-Key': input.key } : {}) },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
    });
    const raw = await response.text();
    return { status: response.status, body: raw ? JSON.parse(raw) as unknown : null };
  }, { authorization, path, method, body, key });
}

function uniqueDocument() {
  let digits = [...String(Date.now()).slice(-10).padStart(12, '1')].map(Number);
  for (const weights of [[5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]]) {
    const remainder = digits.reduce((sum, digit, index) => sum + digit * weights[index]!, 0) % 11;
    digits = [...digits, remainder < 2 ? 0 : 11 - remainder];
  }
  return digits.join('');
}

test('gateway real: cadastro, importação CSV, simulação, aceite idempotente, auditoria e consultas', async ({ page }) => {
  const authorization = await signIn(page, 'operador');
  const reference = `E2E-${randomUUID()}`;
  const documentNumber = uniqueDocument();
  const dueDate = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  const registered = await api(page, authorization(), '/assignors', 'POST', { name: `Homologação ${reference}`, documentNumber });
  expect(registered.status).toBe(201);
  const assignorUuid = created.parse(registered.body).uuid;
  const assignor = await api(page, authorization(), `/assignors/${assignorUuid}`);
  expect(assignor.status).toBe(200); assignorSchema.parse(assignor.body);
  const createdBatch = await api(page, authorization(), '/batches', 'POST', { items: [{ assignorUuid,
    externalReference: reference, type: 'DUPLICATA_MERCANTIL', faceValueBrl: '1000.00', dueDate, paymentCurrency: 'BRL' }] });
  expect(createdBatch.status).toBe(201);
  const batchUuid = batchCreatedSchema.parse(createdBatch.body).uuid;
  const preview = await page.evaluate(async ({ authorization, documentNumber, reference, dueDate }) => {
    const contents = `cedente_documento;referencia_externa;tipo;valor_face;vencimento;moeda_pagamento\n${documentNumber};${reference}-CSV;DUPLICATA_MERCANTIL;1000.00;${dueDate};BRL\n`;
    const form = new FormData(); form.append('format', 'CSV'); form.append('file', new File([contents], 'homologacao.csv', { type: 'text/csv' }));
    const response = await fetch('/api/batches/preview', { method: 'POST', headers: { Authorization: authorization }, body: form });
    return { status: response.status, body: await response.json() as unknown };
  }, { authorization: authorization(), documentNumber, reference, dueDate });
  expect(preview.status).toBe(200); expect(previewSchema.parse(preview.body).itemCount).toBe(1);
  const simulated = await api(page, authorization(), '/simulations', 'POST', { batchUuid });
  expect(simulated.status).toBe(200); simulationSchema.parse(simulated.body);
  const idempotencyKey = randomUUID();
  const accepted = await api(page, authorization(), `/batches/${batchUuid}/settlements`, 'POST', undefined, idempotencyKey);
  expect(accepted.status).toBe(202); const request = requestSchema.parse(accepted.body);
  const replay = await api(page, authorization(), `/batches/${batchUuid}/settlements`, 'POST', undefined, idempotencyKey);
  expect([200, 202]).toContain(replay.status); expect(requestSchema.parse(replay.body).uuid).toBe(request.uuid);
  const detail = await api(page, authorization(), `/batches/${batchUuid}`);
  expect(detail.status).toBe(200); expect(batchDetailSchema.parse(detail.body).activeRequest?.uuid).toBe(request.uuid);
  const titles = await api(page, authorization(), `/batches/${batchUuid}/receivables?page=1&size=20`);
  expect(titles.status).toBe(200); expect(pageOf(receivableSchema).parse(titles.body).totalItems).toBe(1);
  const attempts = await api(page, authorization(), `/settlement-requests/${request.uuid}/items?page=1&size=20`);
  expect(attempts.status).toBe(200); expect(pageOf(requestItemSchema).parse(attempts.body).totalItems).toBe(1);
  const audit = await api(page, authorization(), `/batches/${batchUuid}/audit-events?page=1&size=20`);
  expect(audit.status).toBe(200); expect(pageOf(auditEventSchema).parse(audit.body).totalItems).toBeGreaterThan(1);
  for (const [path, schema] of [['/dashboard', dashboardSchema], ['/settlements/items?page=1&size=20', statementPageSchema], ['/exchange', exchangeViewSchema]] as const) {
    const response = await api(page, authorization(), path); expect(response.status).toBe(200); schema.parse(response.body);
  }
  await page.locator('#page-content').getByRole('link', { name: text.batch.list.title, exact: true }).click();
  await page.getByRole('searchbox', { name: text.batch.search, exact: true }).fill(batchUuid);
  await page.getByRole('button', { name: text.batch.searchAction, exact: true }).click();
  await page.locator(`#page-content a[href="/lotes/${batchUuid}"]`).click();
  await expect(page.getByRole('table', { name: text.batch.receivables })).toContainText(reference);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
});

test('gateway real: proposta cambial exige decisão em sessão de outro gestor', async ({ page, browser, baseURL }) => {
  const operator = await signIn(page, 'operador');
  const response = await api(page, operator(), '/exchange/proposals', 'POST', { proposedRate: '5.123456789012', justification: `Homologação ${randomUUID()}` });
  expect(response.status).toBe(201); const uuid = created.parse(response.body).uuid;
  const managerContext = await browser.newContext({ baseURL, ignoreHTTPSErrors: true });
  try {
    const managerPage = await managerContext.newPage(); const manager = await signIn(managerPage, 'gestor');
    const detail = await api(managerPage, manager(), `/exchange/proposals/${uuid}`);
    const proposal = proposalSchema.parse(detail.body);
    const decision = await api(managerPage, manager(), `/exchange/proposals/${uuid}`, 'PATCH', { status: 'APPROVED', version: proposal.version });
    expect(decision.status).toBe(204);
    const result = proposalSchema.parse((await api(page, operator(), `/exchange/proposals/${uuid}`)).body);
    expect(result.status).toBe('APPROVED');
    expect(result.decision?.decidedBy.subject).not.toBe(result.requestedBy.subject);
  } finally { await managerContext.close(); }
});
