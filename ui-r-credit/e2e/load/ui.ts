import { expect, type Page, type Response } from '@playwright/test';
import { translations, locale } from '../../src/i18n/pt-BR';
import { batchCreatedSchema, previewSchema } from '../../src/batch/services/contracts';
import type { LoadAssignor } from '../../tests/load/dataset';

const text = translations[locale];
export const responseFor = (page: Page, method: string, path: string) => page.waitForResponse(response =>
  response.request().method() === method && new URL(response.url()).pathname === `/api${path}`, { timeout: 120_000 });

export async function signIn(page: Page, role: 'operator' | 'manager' = 'operator', credentials?: { username: string; password: string }) {
  const username = credentials?.username ?? (role === 'manager' ? process.env.LOAD_MANAGER_USERNAME ?? 'gestor' : process.env.LOAD_OPERATOR_USERNAME ?? 'operador');
  const password = credentials?.password ?? (role === 'manager' ? process.env.KEYCLOAK_MANAGER_PASSWORD : process.env.KEYCLOAK_OPERATOR_PASSWORD);
  if (!password) throw new Error(`Defina a senha do ${role === 'manager' ? 'gestor' : 'operador'} para homologação real.`);
  let authorization = '';
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/')) authorization = request.headers().authorization ?? authorization;
  });
  await page.goto('/dashboard');
  await page.getByRole('button', { name: text.auth.login, exact: true }).click();
  await page.locator('input[name="username"]').fill(username);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('input[type="submit"],button[type="submit"]').first().click();
  const update = page.getByRole('heading', { name: 'Update Account Information', exact: true });
  await expect(update.or(page.getByRole('heading', { name: text.dashboard.title, exact: true }))).toBeVisible();
  if (await update.isVisible().catch(() => false)) {
    await page.getByRole('textbox', { name: 'Email', exact: true }).fill(`${username}@srm-credit.local`);
    await page.getByRole('textbox', { name: 'First name', exact: true }).fill(role === 'manager' ? 'Gestor' : 'Operador');
    await page.getByRole('textbox', { name: 'Last name', exact: true }).fill('Homologação');
    await page.getByRole('button', { name: 'Submit', exact: true }).click();
  }
  await expect(page.getByRole('heading', { name: text.dashboard.title, exact: true })).toBeVisible();
  await expect.poll(() => authorization.startsWith('Bearer ')).toBe(true);
}

export async function dismiss(page: Page, title: string) {
  const dialog = page.getByRole('dialog', { name: title, exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: text.common.understood, exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

export async function registerAssignor(page: Page, assignor: LoadAssignor) {
  await page.getByRole('link', { name: text.register.title, exact: true }).click();
  await expect(page.getByRole('heading', { name: text.register.title, exact: true })).toBeVisible();
  const create = page.getByRole('button', { name: text.register.create, exact: true });
  await expect(create).toBeVisible();
  await create.click();
  const dialog = page.getByRole('dialog', { name: text.register.create, exact: true });
  await dialog.getByRole('textbox', { name: text.register.name, exact: true }).fill(assignor.name);
  await dialog.getByRole('textbox', { name: text.register.document, exact: true }).fill(assignor.documentNumber);
  const saved = responseFor(page, 'POST', '/assignors');
  await dialog.getByRole('button', { name: text.register.save, exact: true }).click();
  expect((await saved).status(), `Cadastro do cedente ${assignor.name}`).toBe(201);
  await dismiss(page, text.register.savedTitle);
  await dialog.getByRole('button', { name: text.register.cancel, exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

export async function importBatch(page: Page, file: string, format: 'CSV' | 'CNAB', itemCount: number) {
  await page.locator('#main-navigation').getByRole('link', { name: text.batch.list.title, exact: true }).click();
  await expect(page.getByRole('heading', { name: text.batch.list.title, exact: true })).toBeVisible();
  await page.getByRole('link', { name: text.batch.create.title, exact: true }).click();
  const another = page.locator('button:visible').filter({ hasText: text.batch.manual.another }).first();
  if (await another.count()) await another.click();
  const sourceTab = page.getByRole('tab', { name: text.batch.sources[format], exact: true });
  await expect(sourceTab).toBeEnabled();
  await sourceTab.click();
  await page.getByLabel(text.batch.import.choose, { exact: true }).setInputFiles(file);
  const previewResponse = responseFor(page, 'POST', '/batches/preview');
  await page.getByRole('button', { name: text.batch.import.preview, exact: true }).click();
  const preview = await previewResponse;
  expect(preview.status()).toBe(200);
  expect(previewSchema.parse(await preview.json()).itemCount).toBe(itemCount);
  const createdResponse = responseFor(page, 'POST', '/batches');
  await page.getByRole('button', { name: text.batch.import.confirm, exact: true }).click();
  const created = await createdResponse;
  expect(created.status()).toBe(201);
  const batch = batchCreatedSchema.parse(await created.json());
  await dismiss(page, text.batch.manual.savedTitle);
  const anotherAfterCreate = page.locator('button:visible').filter({ hasText: text.batch.manual.another }).first();
  await expect(anotherAfterCreate).toBeEnabled();
  await anotherAfterCreate.click();
  await page.locator('#main-navigation').getByRole('link', { name: text.batch.list.title, exact: true }).click();
  await expect(page.getByRole('heading', { name: text.batch.list.title, exact: true })).toBeVisible();
  await page.locator(`#page-content a[href="/lotes/${batch.uuid}"]`).click();
  await expect(page).toHaveURL(new RegExp(`/lotes/${batch.uuid}`));
  await expect(page.getByRole('table', { name: text.batch.receivables })).toBeVisible();
  return batch.uuid;
}

export async function prepareSettlement(page: Page) {
  await page.locator('#main-navigation').getByRole('link', { name: text.batch.list.title, exact: true }).click();
  await page.getByRole('button', { name: text.batch.liquidate, exact: true }).first().click();
  await expect(page.getByRole('dialog', { name: text.settlement.flow.confirmTitle })).toBeVisible();
}

export async function confirmSettlement(page: Page, batchUuid: string): Promise<Response> {
  const response = responseFor(page, 'POST', `/batches/${batchUuid}/settlements`);
  await page.getByRole('dialog', { name: text.settlement.flow.confirmTitle })
    .getByRole('button', { name: text.settlement.flow.confirm, exact: true }).click();
  return response;
}

export async function verifySettled(page: Page, batchUuid: string) {
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.locator(`#page-content a[href="/lotes/${batchUuid}"]`).click();
  await expect(page).toHaveURL(new RegExp(`/lotes/${batchUuid}$`));
  const summary = page.getByRole('heading', { name: text.batch.summary, exact: true }).locator('..');
  await expect(summary.getByText(text.batch.statuses.SETTLED, { exact: true })).toBeVisible({ timeout: 180_000 });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText(text.settlement.flow.pending, { exact: true })).toHaveCount(0);
}
