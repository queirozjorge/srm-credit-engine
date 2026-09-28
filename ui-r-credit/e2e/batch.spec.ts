import { test } from './isolatedTest';
import { expect, type Page } from '@playwright/test';
import { translations, locale } from '../tests/pt-BR';
const text = translations[locale]; const copy = text.batch;
const id = '00000000-0000-4000-8000-000000000002';
async function enter(page: Page, path = '/lotes', manager = false) {
  await page.goto(path);
  await page.getByRole('button', { name: manager ? text.demo.manager : text.demo.operator, exact: true }).click();
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
}
test('filtros e rascunho sobrevivem ao detalhe; atualizações preservam a tabela', async ({ page }, info) => {
  await enter(page, '/lotes?q=Exemplo&status=READY&page=1&size=5');
  const requests: string[] = [];
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/batches')) requests.push(new URL(request.url()).pathname); });
  await page.getByRole('searchbox').fill('Rascunho não enviado');
  await page.getByRole('region', { name: copy.table }).evaluate(el => { el.scrollLeft = 100; });
  const left = await page.getByRole('region', { name: copy.table }).evaluate(el => el.scrollLeft);
  await page.getByRole('link', { name: copy.view, exact: true }).dispatchEvent('click', { button: 0 });
  await expect(page.getByRole('table', { name: copy.receivables })).toBeVisible();
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  expect(requests).toEqual([`/api/batches/${id}`, `/api/batches/${id}/receivables`]);
  await page.screenshot({ path: info.outputPath('batch-detail.png'), fullPage: true });
  await page.getByRole('link', { name: copy.back, exact: true }).click();
  await expect(page).toHaveURL(/q=Exemplo&status=READY&page=1&size=5$/);
  await expect(page.getByRole('searchbox')).toHaveValue('Rascunho não enviado');
  await expect(page.getByRole('link', { name: copy.view, exact: true })).toBeFocused();
  await expect.poll(() => page.getByRole('region', { name: copy.table }).evaluate(el => el.scrollLeft)).toBe(left);
  const table = await page.getByRole('table').elementHandle();
  await page.getByRole('button', { name: copy.refreshList, exact: true }).click();
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  expect(await table?.evaluate(el => el.isConnected)).toBe(true);
  await expect(page.getByRole('searchbox')).toHaveValue('Rascunho não enviado');
  expect(requests).toHaveLength(3);
  await page.screenshot({ path: info.outputPath('batch-list.png'), fullPage: true });
});
test('gestor consulta; busca vazia e filtro de estado consultam somente uma vez', async ({ page }) => {
  await enter(page, '/lotes', true);
  await expect(page.getByRole('link', { name: copy.create.title, exact: true })).toHaveCount(0);
  const requests: string[] = []; page.on('request', req => { if (new URL(req.url()).pathname === '/api/batches') requests.push(req.url()); });
  await page.getByRole('combobox', { name: new RegExp(`^${copy.status}`) }).click();
  await page.getByRole('option', { name: copy.statuses.FAILED, exact: true }).click();
  await expect(page.getByRole('table')).toContainText(copy.empty);
  expect(requests).toHaveLength(1); expect(requests[0]).toContain('status=FAILED');
  await page.getByRole('button', { name: copy.clear, exact: true }).click();
  await expect(page.getByRole('table')).toContainText(text.demo.reference);
  expect(requests).toHaveLength(1); // A consulta inicial ainda está válida no cache.
});
test('layout de lotes e detalhe mantém rolagem horizontal dentro da tabela', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enter(page);
  for (const width of [320, 390, 1366]) {
    await page.setViewportSize({ width, height: 768 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`batch-list-${width}.png`), fullPage: true });
  }
  await page.getByRole('link', { name: copy.view, exact: true }).click();
  await expect(page.getByRole('table', { name: copy.receivables })).toBeVisible();
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  await page.setViewportSize({ width: 320, height: 768 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('batch-detail-320.png'), fullPage: true });
});
