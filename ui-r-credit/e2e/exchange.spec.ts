import { test } from './isolatedTest';
import { expect } from '@playwright/test';
import { locale, translations } from '../tests/pt-BR';
const text = translations[locale]; const copy = text.exchange;
const id = '00000000-0000-4000-8000-000000000002';
test('operador propõe com incremento e retorna ao lote para simular sem liquidar', async ({ page }, info) => {
  await page.goto(`/lotes/${id}`); await page.getByRole('button', { name: text.demo.operator, exact: true }).click();
  await page.getByRole('tab', { name: text.batch.detailTabs.requests }).click();
  await page.getByRole('link', { name: text.pricing.goExchange, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`cambio\\?lote=${id}`));
  await page.getByRole('tab', { name: copy.proposals, exact: true }).click();
  await expect(page.getByRole('table', { name: copy.proposals })).toBeVisible();
  const trigger = page.getByRole('button', { name: copy.propose, exact: true, includeHidden: true });
  for (let i = 0; i < 5; i++) {
    await trigger.click(); const dialog = page.getByRole('dialog', { name: copy.propose });
    await expect(dialog.getByRole('heading', { name: copy.propose })).toBeFocused();
    await trigger.evaluate(async (button: Element) => {
      const dialog = button.ownerDocument.querySelector('[role="dialog"]');
      if (!dialog) throw new Error('O diálogo precisa estar aberto para testar o fechamento.');
      dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await Promise.resolve();
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
  }
  await trigger.click();
  await page.getByRole('textbox', { name: copy.increment, exact: true }).fill('0,000000000001');
  await page.getByRole('button', { name: copy.applyIncrement }).click();
  await page.getByRole('textbox', { name: new RegExp(copy.justification) }).fill('Ajuste operacional de demonstração.');
  await expect(page.getByRole('dialog', { name: copy.propose }).locator('..')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: info.outputPath('proposal.png') });
  const requests: string[] = []; page.on('request', req => { if (req.url().includes('/api/')) requests.push(`${req.method()} ${new URL(req.url()).pathname}`); });
  await page.getByRole('button', { name: copy.save, exact: true }).click();
  const warning = page.getByRole('dialog', { name: copy.savedTitle }); await expect(warning).toBeVisible();
  expect(requests).toEqual(['POST /api/exchange/proposals', 'GET /api/exchange']);
  await warning.getByRole('button', { name: text.common.understood, exact: true }).click(); await expect(warning).toHaveCount(0);
  await page.getByRole('dialog', { name: copy.propose }).getByRole('button', { name: copy.cancel, exact: true }).click();
  await expect(page.getByRole('table', { name: copy.proposals })).toContainText('5,000000000001');
  await page.getByRole('link', { name: copy.backSimulate, exact: true }).click();
  await expect(page.getByText(text.pricing.current, { exact: true })).toBeVisible();
  expect(requests.filter(row => row.endsWith('/api/simulations'))).toHaveLength(1);
  expect(requests.some(row => row.includes('/settlements'))).toBe(false);
});


for (const decision of ['approve', 'reject'] as const) test(`gestor ${decision}: decisão única, histórico e retorno somente para consulta`, async ({ page }, info) => {
  await page.goto(`/cambio?lote=${id}`); await page.getByRole('button', { name: text.demo.manager, exact: true }).click();
  await page.getByRole('tab', { name: copy.proposals, exact: true }).click();
  await expect(page.getByRole('table', { name: copy.proposals })).toBeVisible();
  await expect(page.getByRole('button', { name: copy.propose, exact: true })).toHaveCount(0);
  const trigger = page.getByRole('button', { name: copy.review, exact: true, includeHidden: true });
  for (let i = 0; i < 5; i++) {
    await trigger.click(); const dialog = page.getByRole('dialog', { name: copy.detail });
    await expect(dialog.getByRole('heading', { name: copy.detail })).toBeFocused();
    await page.keyboard.press('Escape'); await trigger.dispatchEvent('click');
    await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
  }
  await page.emulateMedia({ reducedMotion: 'reduce' }); await trigger.click();
  const requests: string[] = []; page.on('request', req => { if (req.url().includes('/api/')) requests.push(`${req.method()} ${new URL(req.url()).pathname}`); });
  if (decision === 'reject') {
    await page.getByRole('button', { name: copy.reject, exact: true }).click();
    await expect(page.getByText(copy.justificationInvalid, { exact: true })).toBeVisible(); expect(requests).toEqual([]);
    await page.getByRole('textbox', { name: copy.reason, exact: true }).fill('Cotação fora das condições acordadas.');
  }
  await page.getByRole('button', { name: copy[decision], exact: true }).click();
  const warning = page.getByRole('dialog', { name: copy.savedTitle }); await expect(warning).toBeVisible();
  expect(requests).toHaveLength(2); expect(requests[0]).toMatch(/^PATCH /); expect(requests[1]).toBe('GET /api/exchange');
  await warning.getByRole('button', { name: text.common.understood, exact: true }).click(); await expect(warning).toHaveCount(0);
  await page.getByRole('dialog', { name: copy.detail }).getByRole('button', { name: copy.cancel, exact: true }).click();
  await expect(page.getByRole('table', { name: copy.proposals })).toContainText(copy.statuses[decision === 'approve' ? 'APPROVED' : 'REJECTED']);
  await page.getByRole('tab', { name: copy.quotes, exact: true }).click();
  await expect(page.getByRole('table', { name: copy.quotes })).toBeVisible();
  for (const width of [320, 390, 1366]) {
    await page.setViewportSize({ width, height: 768 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 390) await page.screenshot({ path: info.outputPath('exchange-mobile.png'), fullPage: true });
  }
  await page.screenshot({ path: info.outputPath('exchange.png'), fullPage: true });
  await page.getByRole('link', { name: copy.back, exact: true }).click();
  await expect(page.getByRole('table', { name: text.batch.receivables })).toBeVisible();
  expect(requests.some(row => row.includes('/simulations') || row.includes('/settlements'))).toBe(false);
});
