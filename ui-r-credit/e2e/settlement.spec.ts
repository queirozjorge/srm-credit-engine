import { test } from './demoTest';
import { expect } from '@playwright/test';
import { translations, locale } from '../src/i18n/pt-BR';
const text = translations[locale]; const flow = text.settlement.flow;
const id = '00000000-0000-4000-8000-000000000002';
test('simula, confirma com ciclo estável e acompanha sem bloquear até resultado integral', async ({ page }, info) => {
  await page.goto(`/lotes/${id}`);
  await page.getByRole('button', { name: text.demo.operator, exact: true }).click();
  await page.getByRole('button', { name: text.pricing.refresh, exact: true }).click();
  const trigger = page.getByRole('button', { name: flow.requestAction, exact: true, includeHidden: true });
  await expect(trigger).toBeEnabled();
  for (let i = 0; i < 5; i++) {
    await trigger.click(); const dialog = page.getByRole('dialog', { name: flow.confirmTitle }); await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: flow.confirmTitle })).toBeFocused();
    await page.keyboard.press('Escape'); await trigger.dispatchEvent('click');
    await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
  }
  await trigger.click();
  await expect(page.getByRole('dialog', { name: flow.confirmTitle }).locator('..')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: info.outputPath('confirmation.png') });
  const posts: string[] = []; const statusReads: string[] = [];
  page.on('request', req => { if (req.method() === 'GET' && /\/api\/(batches\/[^/]+|settlement-requests\/[^/]+)$/.test(new URL(req.url()).pathname)) statusReads.push(new URL(req.url()).pathname); });
  page.on('request', req => { if (req.method() === 'POST' && req.url().endsWith('/settlements')) posts.push(req.postData() ?? ''); });
  await page.getByRole('button', { name: flow.confirm, exact: true }).click();
  await expect(page.getByRole('dialog', { name: flow.confirmTitle })).toHaveCount(0);
  await expect(page.getByText(flow.pending, { exact: true })).toBeVisible();
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  await expect(page.getByText(flow.pending, { exact: true })).toHaveCount(0, { timeout: 15000 });
  expect(posts).toEqual(['']);
  expect(statusReads.length).toBeGreaterThan(0);
  expect(statusReads.every(path => path === `/api/batches/${id}`)).toBe(true);
  await page.getByRole('button', { name: flow.items, exact: true }).click();
  await expect(page.getByRole('table', { name: flow.items })).toContainText('1.000,00');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('settled.png'), fullPage: true });
  await page.getByRole('button', { name: flow.history, exact: true }).click();
  const view = page.getByRole('table', { name: flow.history, includeHidden: true }).getByRole('button', { name: text.batch.view, includeHidden: true });
  for (let i = 0; i < 5; i++) {
    await view.click(); const dialog = page.getByRole('dialog', { name: flow.history });
    await expect(dialog.getByRole('heading', { name: flow.history })).toBeFocused();
    await page.keyboard.press('Escape'); await view.dispatchEvent('click');
    await expect(dialog).toHaveCount(0); await expect(view).toBeFocused();
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await view.click(); await page.getByRole('dialog').getByRole('button', { name: flow.cancel }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 768 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('link', { name: text.settlement.statement.title, exact: true, includeHidden: true }).dispatchEvent('click', { button: 0 });
  await expect(page.getByRole('table', { name: text.settlement.statement.table })).toContainText('1.000,00');
  await page.getByRole('link', { name: text.dashboard.title, exact: true, includeHidden: true }).dispatchEvent('click', { button: 0 });
  await expect(page.getByRole('img', { name: new RegExp(text.dashboard.chart) })).toBeVisible();
  await expect(page.getByText(text.dashboard.maximum('1.000,00', 'BRL'), { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('dashboard-settled.png'), fullPage: true });

});
test('gestor consulta sem ação de simulação ou liquidação', async ({ page }) => {
  await page.goto(`/lotes/${id}`);
  await page.getByRole('button', { name: text.demo.manager, exact: true }).click();
  await expect(page.getByRole('table', { name: text.batch.receivables })).toBeVisible();
  await expect(page.getByRole('button', { name: text.pricing.refresh, exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: flow.requestAction, exact: true })).toHaveCount(0);
});
