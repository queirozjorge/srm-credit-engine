import { test } from './isolatedTest';
import { expect, type Page } from '@playwright/test';
import { translations, locale } from '../tests/pt-BR';
const text = translations[locale]; const copy = text.batch.manual;
async function enter(page: Page) {
  await page.goto('/lotes/novo');
  await page.getByRole('button', { name: text.demo.operator, exact: true }).click();
  await expect(page.getByRole('table', { name: text.register.choose })).toBeVisible();
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
}
async function fill(page: Page, reference = '000123') {
  await page.getByRole('button', { name: text.register.select, exact: true }).click();
  await page.getByRole('textbox', { name: text.batch.reference, exact: false }).fill(reference);
  await page.getByRole('textbox', { name: text.batch.faceValue, exact: false }).fill('1.234,56');
  await page.getByLabel(text.batch.dueDate, { exact: false }).fill('2099-12-31');
}
test('cadastro revisado envia uma vez, preserva dados e gera lote READY', async ({ page }, info) => {
  await enter(page); await fill(page, ' 000123 ');
  await page.getByRole('combobox', { name: new RegExp(`^${text.batch.currency}`) }).click();
  await page.getByRole('option', { name: text.batch.currencies.USD, exact: true }).click();
  await page.getByRole('button', { name: copy.addItem, exact: true }).click();
  await expect(page.getByRole('table', { name: copy.draftTable })).toContainText('000123');
  await page.getByRole('button', { name: copy.editItem, exact: true }).click();
  await expect(page.getByRole('textbox', { name: text.batch.reference, exact: false })).toHaveValue('000123');
  await page.getByRole('button', { name: copy.saveItem, exact: true }).click();
  await page.getByRole('button', { name: copy.review, exact: true }).click();
  await expect(page.getByText(copy.reviewHint, { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('manual-review.png'), fullPage: true });
  const requests: { method: string; path: string; body: unknown }[] = [];
  page.on('request', req => { const path = new URL(req.url()).pathname;
    if (path.startsWith('/api/')) requests.push({ method: req.method(), path, body: req.postDataJSON() }); });
  await page.getByRole('button', { name: copy.confirm, exact: true }).evaluate((el: HTMLButtonElement) => { el.click(); el.click(); });
  await expect(page.getByRole('dialog', { name: copy.savedTitle, exact: true })).toBeVisible();
  expect(requests.map(req => req.method)).toEqual(['POST', 'GET']);
  expect(requests[0]?.body).toEqual({ items: [{ assignorUuid: '00000000-0000-4000-8000-000000000001', externalReference: '000123', type: 'DUPLICATA_MERCANTIL', faceValueBrl: '1234.56', dueDate: '2099-12-31', paymentCurrency: 'USD' }] });
  await page.getByRole('button', { name: text.common.understood, exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('link', { name: text.batch.view, exact: true }).click();
  await expect(page.getByRole('table', { name: text.batch.receivables })).toContainText('000123');
  await expect(page.getByRole('heading', { name: text.batch.summary, exact: true }).locator('..').getByText(text.batch.statuses.READY, { exact: true })).toBeVisible();
  expect(requests.filter(req => req.method === 'POST')).toHaveLength(1);
  expect(requests.some(req => /settlement|simulation/.test(req.path))).toBe(false);
});
test('valida campos, duplicidade local, conflito remoto e preserva rascunho', async ({ page }, info) => {
  await enter(page);
  await page.getByRole('button', { name: copy.addItem, exact: true }).click();
  await expect(page.getByRole('textbox', { name: copy.assignor, exact: false })).toBeFocused();
  await fill(page, 'DEMO-001');
  await page.getByRole('button', { name: copy.addItem, exact: true }).click();
  await page.getByRole('button', { name: copy.addItem, exact: true }).click();
  await fill(page, ' DEMO-001 ');
  await page.getByRole('button', { name: copy.addItem, exact: true }).click();
  await expect(page.getByText(copy.fields.externalReference, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: copy.cancelItem, exact: true }).click();
  await page.getByRole('button', { name: copy.review, exact: true }).click();
  await page.getByRole('button', { name: copy.confirm, exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(copy.errors.duplicate);
  await page.getByRole('button', { name: text.common.understood, exact: true }).click();
  await expect(page.getByRole('table', { name: copy.draftTable })).toContainText('DEMO-001');
  await page.getByRole('button', { name: copy.backToItems, exact: true }).click();
  await page.getByRole('button', { name: copy.editItem, exact: true }).click();
  await expect(page.getByRole('textbox', { name: text.batch.reference, exact: false })).toHaveValue('DEMO-001');
  await page.setViewportSize({ width: 320, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('manual-editor-320.png'), fullPage: true });
  await page.getByRole('button', { name: copy.cancelItem, exact: true }).click();
  await page.getByRole('button', { name: copy.removeItem, exact: true }).click();
  await expect(page.getByRole('button', { name: copy.review, exact: true })).toBeDisabled();
});
