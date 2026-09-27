import { expect, test } from '@playwright/test';
import { locale, translations } from '../tests/pt-BR';

const text = translations[locale].common;
test.beforeEach(async ({ page }) => { await page.goto('/e2e/fixtures/components.html'); });

test('modal mantém saída, ignora clique atrasado e restaura foco em cinco ciclos', async ({ page }) => {
  const trigger = page.getByRole('button', { name: text.preview.open, exact: true });
  const dialog = page.getByRole('dialog', { name: text.preview.dialog });
  for (let cycle = 0; cycle < 5; cycle += 1) {
    const box = await trigger.boundingBox();
    await trigger.click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: text.preview.dialog })).toBeFocused();
    await page.mouse.click(5, 5);
    await expect(dialog).toBeVisible();
    if (cycle % 2 === 0) await dialog.getByRole('button', { name: text.close, exact: true }).click();
    else await page.keyboard.press('Escape');
    if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(page.getByLabel(text.preview.closeCount)).toHaveText(String(cycle + 1));
  }
});

test('aviso central deduplica e fecha por teclado sem reaparecer', async ({ page }) => {
  const trigger = page.getByRole('button', { name: text.preview.notice, exact: true });
  for (let cycle = 0; cycle < 5; cycle += 1) {
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: text.warning });
    await expect(dialog).toHaveCount(1);
    await expect(dialog).toContainText(text.preview.message);
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: text.understood })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
});

test('carregamento aguarda todas as operações e preserva edição e foco', async ({ page }) => {
  const field = page.getByRole('textbox', { name: text.preview.name });
  await field.fill('Rascunho');
  const trigger = page.getByRole('button', { name: text.preview.load, exact: true });
  await trigger.click();
  const status = page.getByRole('status');
  await expect(status).toContainText(text.loading);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(450);
  await expect(status).toContainText(text.loading);
  await expect(page.getByText(text.loading, { exact: true })).not.toBeVisible();
  await expect(field).toHaveValue('Rascunho');
  await expect(trigger).toBeFocused();
});

test('edição, seleção, colagem e navegação nos campos preservam precisão', async ({ page }, info) => {
  await page.getByRole('button', { name: text.preview.open, exact: true }).click();
  const amount = page.getByRole('textbox', { name: text.preview.amount, exact: true });
  await amount.fill('99.999.999.999.999.999,99');
  await page.keyboard.press('Tab');
  await expect(amount).toHaveValue('99.999.999.999.999.999,99');
  await amount.click();
  await amount.press('ControlOrMeta+A');
  await amount.pressSequentially('12,34');
  await amount.press('ArrowLeft');
  await amount.press('Backspace');
  await page.keyboard.press('Tab');
  await expect(amount).toHaveValue('12,40');
  const rate = page.getByRole('textbox', { name: text.preview.rate, exact: true });
  await rate.fill('0,123456789012');
  await page.keyboard.press('Tab');
  await expect(rate).toHaveValue('0,123456789012');
  const document = page.getByRole('textbox', { name: text.preview.document, exact: true });
  await document.fill('00123456000190');
  await page.keyboard.press('Tab');
  await expect(document).toHaveValue('00.123.456/0001-90');
  await page.getByLabel(text.preview.date, { exact: true }).fill('2026-09-26');
  await expect(page.getByLabel(text.preview.date, { exact: true })).toHaveValue('2026-09-26');
  await page.screenshot({ path: info.outputPath('fields-dialog.png'), fullPage: true });
});

test('tabela contém rolagem e paginação; combobox abre e fecha cinco vezes', async ({ page }, info) => {
  const region = page.getByRole('region', { name: text.preview.table });
  const combo = page.getByRole('combobox');
  for (let cycle = 0; cycle < 5; cycle += 1) {
    await combo.click();
    await expect(page.getByRole('listbox')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await expect(combo).toBeFocused();
  }
  await combo.click();
  await page.getByRole('option', { name: '50', exact: true }).click();
  expect(await region.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await region.evaluate((element) => { element.scrollTop = 400; });
  await expect(page.getByRole('columnheader', { name: text.preview.reference })).toBeVisible();
  await page.getByRole('button', { name: text.pagination.next, exact: true }).click();
  await expect(page.getByRole('table')).toContainText(text.preview.row(51));
  await expect(page.getByRole('status')).toHaveText(text.pagination.page(2, 2));
  await page.setViewportSize({ width: 320, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('components-mobile.png'), fullPage: true });
});

test('modal também fecha com movimento reduzido', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: text.preview.open, exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
