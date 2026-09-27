import { test } from './isolatedTest';
import { expect } from '@playwright/test';
import { translations, locale } from '../tests/pt-BR';
const text = translations[locale]; const flow = text.settlement.flow;
const id = '00000000-0000-4000-8000-000000000002';
test('confirma pela tabela com ciclo estável e acompanha até resultado integral', async ({ page }, info) => {
  await page.goto('/lotes');
  await page.getByRole('button', { name: text.demo.operator, exact: true }).click();
  const trigger = page.getByRole('button', { name: text.batch.liquidate, exact: true });
  await expect(trigger).toBeEnabled();
  for (let i = 0; i < 5; i++) {
    await trigger.click(); const dialog = page.getByRole('dialog', { name: flow.confirmTitle }); await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: flow.confirmTitle })).toBeFocused();
    await page.evaluate(([closeLabel, actionLabel]) => {
      const buttons = [...document.querySelectorAll('button')];
      const close = buttons.find(button => button.textContent?.trim() === closeLabel);
      const action = buttons.find(button => button.getAttribute('aria-label') === actionLabel);
      if (!close || !action) throw new Error('Os controles do modal de liquidação não foram encontrados.');
      close.click();
      action.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }, [flow.cancel, text.batch.liquidate]);
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
  await page.getByRole('link', { name: text.batch.view, exact: true }).click();
  await page.getByRole('tab', { name: text.batch.detailTabs.requests, exact: true }).click();
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
  await page.getByRole('dialog', { name: flow.results }).getByRole('button', { name: text.common.close, exact: true }).click();
  await expect(page.getByRole('dialog', { name: flow.results })).toHaveCount(0);
  await page.getByRole('button', { name: flow.history, exact: true }).click();
  const history = page.getByRole('dialog', { name: flow.historyTitle });
  await expect(history.getByRole('table', { name: flow.historyTitle })).toBeVisible();
  await history.getByRole('button', { name: text.common.close, exact: true }).click();
  await expect(history).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 768 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('link', { name: text.settlement.statement.title, exact: true, includeHidden: true }).dispatchEvent('click', { button: 0 });
  await expect(page.getByRole('table', { name: text.settlement.statement.table })).toContainText('1.000,00');
  await page.getByRole('link', { name: text.dashboard.title, exact: true, includeHidden: true }).dispatchEvent('click', { button: 0 });
  await expect(page.getByRole('group', { name: new RegExp(text.dashboard.chart) })).toBeVisible();
  await expect(page.getByText(text.dashboard.maximum('1.000,00', 'BRL'), { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('dashboard-settled.png'), fullPage: true });

});
test('gestor consulta sem ação de simulação ou liquidação', async ({ page }) => {
  await page.goto(`/lotes/${id}`);
  await page.getByRole('button', { name: text.demo.manager, exact: true }).click();
  await page.getByRole('tab', { name: text.batch.detailTabs.receivables }).click();
  await expect(page.getByRole('table', { name: text.batch.receivables })).toBeVisible();
  await page.getByRole('tab', { name: text.batch.detailTabs.requests }).click();
  await expect(page.getByRole('button', { name: text.pricing.refresh, exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: flow.requestAction, exact: true })).toHaveCount(0);
});
