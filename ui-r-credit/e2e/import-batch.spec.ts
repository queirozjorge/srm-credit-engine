import { test } from './isolatedTest';
import { expect, type Page } from '@playwright/test';
import { locale, translations } from '../tests/pt-BR';
import { sampleContents } from '../tests/batch/mocks/importSamples';
const text = translations[locale]; const copy = text.batch.import;
async function enter(page: Page, format: 'CSV' | 'CNAB' = 'CSV') {
  await page.goto('/lotes/novo'); await page.getByRole('button', { name: text.demo.operator, exact: true }).click();
  await expect(page.getByRole('heading', { name: text.batch.create.title, exact: true })).toBeVisible();
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  await page.getByRole('tab', { name: text.batch.sources[format], exact: true }).click();
}
async function dismiss(page: Page) {
  await page.getByRole('button', { name: text.common.understood, exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
for (const format of ['CSV', 'CNAB'] as const) test(`${format}: prévia, revisão e importação integral sem liquidação`, async ({ page }, info) => {
  await enter(page, format);
  const requests: { method: string; path: string; content: string }[] = [];
  page.on('request', req => { if (new URL(req.url()).pathname.startsWith('/api/batches')) requests.push({ method: req.method(), path: new URL(req.url()).pathname, content: req.headers()['content-type'] ?? '' }); });
  await page.getByLabel(copy.choose, { exact: true }).setInputFiles({ name: `sample.${format.toLowerCase()}`, mimeType: 'text/plain', buffer: Buffer.from(sampleContents(format)) });
  await page.getByRole('button', { name: copy.preview, exact: true }).click();
  await expect(page.getByRole('table', { name: copy.table })).toContainText(`${format}-0001`);
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  expect(requests.map(req => req.path)).toEqual(['/api/batches/preview']);
  if (format === 'CNAB') {
    await page.getByRole('combobox', { name: new RegExp(`^${copy.currencyFor(3)}`) }).click();
    await page.getByRole('option', { name: text.batch.currencies.USD, exact: true }).click();
  } else await expect(page.getByRole('table', { name: copy.table }).getByRole('combobox')).toHaveCount(0);
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath(`import-${format}.png`), fullPage: true });
  await page.getByRole('button', { name: copy.confirm, exact: true }).evaluate((el: HTMLButtonElement) => { el.click(); el.click(); });
  await expect(page.getByRole('dialog', { name: text.batch.manual.savedTitle })).toBeVisible();
  expect(requests.map(req => req.method)).toEqual(['POST', 'POST', 'GET']);
  expect(requests[0]?.content).toContain('multipart/form-data; boundary=');
  expect(requests[1]?.content).toContain('multipart/form-data; boundary=');
  await dismiss(page);
  await expect(page.getByLabel(copy.choose)).toHaveCount(0);
  await page.getByRole('link', { name: text.batch.view, exact: true }).click();
  await expect(page.getByRole('table', { name: text.batch.receivables })).toContainText(`${format}-0001`);
  if (format === 'CNAB') await expect(page.getByRole('row').filter({ hasText: 'CNAB-0001' })).toContainText(text.batch.currencies.USD);
  await expect(page.getByRole('heading', { name: text.batch.summary, exact: true }).locator('..').getByText(text.batch.statuses.READY, { exact: true })).toBeVisible();
});
test('422 bloqueia cadastro parcial; erros por linha abrem e fecham sem reabertura', async ({ page }, info) => {
  await enter(page);
  await page.getByLabel(copy.choose, { exact: true }).setInputFiles({ name: 'invalid.csv', mimeType: 'text/csv', buffer: Buffer.from(sampleContents('CSV', true)) });
  await page.getByRole('button', { name: copy.preview, exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(copy.partialBlocked); await dismiss(page);
  await expect(page.getByRole('table', { name: copy.table })).toContainText('CSV-0001');
  await expect(page.getByRole('button', { name: copy.confirm, exact: true })).toBeDisabled();
  const trigger = page.getByRole('button', { name: copy.issues(1, false), exact: true });
  for (let i = 0; i < 5; i++) {
    const dialog = page.locator('[role="dialog"]');
    await trigger.click(); await expect(page.getByRole('dialog')).toContainText(copy.issue(3, 'externalReference', copy.demoField));
    await page.keyboard.press('Escape');
    await expect(dialog).toBeAttached();
    await dialog.dispatchEvent('click');
    await expect(page.getByRole('dialog')).toHaveCount(0); await expect(trigger).toBeFocused();
  }
  await page.setViewportSize({ width: 320, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('import-invalid-320.png'), fullPage: true });
  await page.getByRole('tab', { name: text.batch.sources.CNAB, exact: true }).click();
  await expect(page.getByRole('table', { name: copy.table })).toHaveCount(0);
  await expect(page.getByRole('button', { name: copy.preview, exact: true })).toBeDisabled();
});
test('arquivo acima de 5 MiB é rejeitado antes da prévia', async ({ page }) => {
  await enter(page);
  const requests: string[] = []; page.on('request', req => { if (req.method() === 'POST') requests.push(req.url()); });
  await page.getByLabel(copy.choose, { exact: true }).setInputFiles({ name: 'grande.csv', mimeType: 'text/csv', buffer: Buffer.alloc(5 * 1024 * 1024 + 1, 'x') });
  await expect(page.getByRole('dialog')).toContainText(copy.tooLarge); expect(requests).toHaveLength(0);
  await dismiss(page); await expect(page.getByRole('button', { name: copy.preview, exact: true })).toBeDisabled();
});
