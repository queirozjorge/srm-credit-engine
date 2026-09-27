import { test } from './demoTest';
import { expect, type Page } from '@playwright/test';
import { translations, locale } from '../src/i18n/pt-BR';
const text = translations[locale]; const copy = text.register;
const fixtureUuid = '00000000-0000-4000-8000-000000000001';
async function enter(page: Page, profile: 'operator' | 'manager' = 'operator', path = '/cedentes') {
  await page.goto(path);
  await page.getByRole('button', { name: text.demo[profile], exact: true }).click();
  await expect(page.getByRole('button', { name: copy.create, exact: true })).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();
}
async function dismiss(page: Page) {
  await page.getByRole('dialog').getByRole('button', { name: text.common.understood, exact: true }).click();
  await expect(page.getByRole('dialog', { name: text.common.warning, exact: true })).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: copy.savedTitle, exact: true })).toHaveCount(0);
}
test('gestor cadastra e edita; cada envio faz uma mutação e uma consulta', async ({ page }, info) => {
  await enter(page, 'manager');
  const requests: string[] = [];
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/assignors')) requests.push(request.method()); });
  await page.getByRole('button', { name: copy.create, exact: true }).click();
  let form = page.getByRole('dialog', { name: copy.create, exact: true });
  await form.getByRole('textbox', { name: copy.name, exact: true }).fill('Cedente de teste');
  await form.getByRole('textbox', { name: copy.document, exact: true }).fill('11444777000161');
  await form.getByRole('button', { name: copy.save, exact: true }).evaluate((element: HTMLButtonElement) => { element.click(); element.click(); });
  await expect(page.getByRole('dialog', { name: copy.savedTitle })).toBeVisible();
  expect(requests).toEqual(['POST', 'GET']);
  await dismiss(page);
  await expect(form.getByRole('textbox', { name: copy.name, exact: true })).toHaveValue('Cedente de teste');
  await expect(form.getByRole('button', { name: copy.save, exact: true })).toBeDisabled();
  await form.getByRole('button', { name: copy.cancel, exact: true }).click();
  await page.getByRole('row').filter({ hasText: 'Cedente de teste' }).getByRole('button', { name: copy.view }).click();
  await expect(page.getByRole('button', { name: copy.edit, exact: true })).toBeEnabled();
  await page.getByRole('button', { name: copy.edit, exact: true }).click();
  form = page.getByRole('dialog', { name: copy.edit, exact: true });
  await expect(form.getByRole('textbox', { name: copy.document, exact: true })).toBeDisabled();
  await form.getByRole('textbox', { name: copy.name, exact: true }).fill('Cedente atualizado');
  requests.length = 0;
  await form.getByRole('button', { name: copy.save, exact: true }).click();
  await expect(page.getByRole('dialog', { name: copy.savedTitle })).toBeVisible();
  expect(requests).toEqual(['PATCH', 'GET']);
  await dismiss(page);
  await form.getByRole('button', { name: copy.cancel, exact: true }).click();
  await expect(form).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  await expect(page.locator('dd').filter({ hasText: 'Cedente atualizado' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('assignor-detail.png'), fullPage: true });
});
test('validação evita envio e duplicidade preserva formulário; modal fecha em cinco ciclos', async ({ page }) => {
  await enter(page);
  let posts = 0; page.on('request', request => { if (request.method() === 'POST') posts++; });
  const trigger = page.getByRole('button', { name: copy.create, exact: true });
  await trigger.click();
  const form = page.getByRole('dialog', { name: copy.create, exact: true });
  await form.getByRole('button', { name: copy.save, exact: true }).click();
  await expect(form.getByRole('textbox', { name: copy.name, exact: true })).toBeFocused();
  await form.getByRole('textbox', { name: copy.name, exact: true }).fill('Meu rascunho');
  await form.getByRole('textbox', { name: copy.document, exact: true }).fill('00000000000000');
  await form.getByRole('button', { name: copy.save, exact: true }).click();
  await expect(form.getByText(copy.documentInvalid)).toBeVisible(); expect(posts).toBe(0);
  await form.getByRole('textbox', { name: copy.document, exact: true }).fill('11222333000181');
  await form.getByRole('button', { name: copy.save, exact: true }).click();
  await expect(page.getByRole('dialog', { name: text.common.warning, exact: true })).toContainText(text.demo.duplicate);
  await dismiss(page);
  await expect(form.getByRole('textbox', { name: copy.name, exact: true })).toHaveValue('Meu rascunho');
  await expect(form.getByRole('button', { name: copy.save, exact: true })).toBeFocused();
  await form.getByRole('button', { name: copy.cancel, exact: true }).click();
  await expect(form).toHaveCount(0);
  for (let cycle = 0; cycle < 5; cycle++) {
    const rect = await trigger.boundingBox(); await trigger.click();
    await expect(form).toBeVisible();
    if (cycle % 2) await page.keyboard.press('Escape'); else await form.getByRole('button', { name: copy.cancel, exact: true }).click();
    if (rect) await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await expect(form).toHaveCount(0); await expect(trigger).toBeFocused();
  }
  expect(posts).toBe(1);
});
test('conflito de versão permite comparar sem perder rascunho', async ({ page }) => {
  await enter(page);
  await page.getByRole('button', { name: copy.view, exact: true }).click();
  await page.getByRole('button', { name: copy.edit, exact: true }).click();
  const form = page.getByRole('dialog', { name: copy.edit, exact: true });
  await form.getByRole('textbox', { name: copy.name, exact: true }).fill('Minha alteração');
  await page.evaluate(async id => { await fetch(`/api/assignors/${id}`, { method: 'PATCH', headers: { 'X-Demo-Subject': 'gestor-demo', 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Alteração concorrente', version: '0' }) }); }, fixtureUuid);
  await form.getByRole('button', { name: copy.save, exact: true }).click();
  await expect(page.getByRole('dialog', { name: text.common.warning, exact: true })).toContainText(text.demo.conflict);
  await dismiss(page);
  await expect(form.getByRole('textbox', { name: copy.name, exact: true })).toHaveValue('Minha alteração');
  await form.getByRole('button', { name: copy.review, exact: true }).click();
  await expect(form.getByRole('textbox', { name: copy.currentName, exact: true })).toHaveValue('Alteração concorrente');
  await expect(form.getByRole('textbox', { name: copy.name, exact: true })).toHaveValue('Minha alteração');
  await form.getByRole('button', { name: copy.saveReviewed, exact: true }).click();
  await expect(page.getByRole('dialog', { name: copy.savedTitle })).toBeVisible();
  await dismiss(page);
  await form.getByRole('button', { name: copy.cancel, exact: true }).click();
  for (let cycle = 0; cycle < 5; cycle++) {
    const trigger = page.getByRole('button', { name: copy.edit, exact: true });
    const rect = await trigger.boundingBox(); await trigger.click();
    await expect(form).toBeVisible(); await page.keyboard.press('Escape');
    if (rect) await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await expect(form).toHaveCount(0); await expect(trigger).toBeFocused();
  }
});
test('busca explícita, detalhe e paginação preservam contexto sem consultas redundantes', async ({ page }, info) => {
  await enter(page);
  let reads = 0; page.on('request', request => { if (request.method() === 'GET' && new URL(request.url()).pathname.startsWith('/api/assignors')) reads++; });
  await page.getByRole('searchbox', { name: copy.search }).fill('11.222.333/0001-81'); expect(reads).toBe(0);
  await page.getByRole('button', { name: copy.searchAction, exact: true }).click();
  await expect(page).toHaveURL(/q=11222333000181/);
  await expect(page.getByRole('button', { name: copy.view, exact: true })).toBeVisible(); await expect.poll(() => reads).toBe(1);
  await page.getByRole('button', { name: copy.view, exact: true }).click();
  await expect(page.getByRole('heading', { name: copy.detail })).toBeVisible();
  await page.getByRole('button', { name: copy.back }).click();
  await expect(page.getByRole('searchbox', { name: copy.search })).toHaveValue('11222333000181');
  expect(reads).toBe(2);
  await page.getByRole('searchbox', { name: copy.search }).fill('não existe');
  await page.getByRole('button', { name: copy.searchAction, exact: true }).click();
  await expect(page.getByRole('table')).toContainText(copy.empty);
  await page.getByRole('button', { name: copy.clear, exact: true }).click();
  await expect(page.getByRole('button', { name: copy.view })).toBeVisible();
  await page.setViewportSize({ width: info.project.name.startsWith('mobile') ? 320 : 1366, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('region', { name: copy.table }).evaluate(element => { element.scrollLeft = 0; });
  await page.screenshot({ path: info.outputPath('assignors.png'), fullPage: true });
});
test('paginação aguarda ação do usuário e preserva rolagem ao voltar do detalhe', async ({ page }, info) => {
  await enter(page);
  await page.evaluate(async documents => {
    for (const [index, documentNumber] of documents.entries()) {
      const response = await fetch('/api/assignors', { method: 'POST', headers: { 'X-Demo-Subject': 'operador-demo', 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `Cedente ${index + 1}`, documentNumber }) });
      if (response.status !== 201) throw new Error('Fixture rejected');
    }
  }, ['12345000000102', '12345001000157', '12345002000100', '12345003000146', '12345004000190', '12345005000135']);
  await page.getByRole('button', { name: copy.retry, exact: true }).click();
  await expect(page.getByText(copy.total(7), { exact: true })).toBeVisible();
  await page.getByRole('combobox').click(); await page.getByRole('option', { name: '5', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText(text.common.pagination.page(1, 2));
  await page.getByRole('button', { name: text.common.pagination.next, exact: true }).click();
  await expect(page.getByRole('status')).toHaveText(text.common.pagination.page(2, 2));
  await expect(page).toHaveURL(/page=2/);
  await page.getByRole('button', { name: text.common.pagination.previous, exact: true }).click();
  await expect(page.getByRole('status')).toHaveText(text.common.pagination.page(1, 2));
  const region = page.getByRole('region', { name: copy.table });
  await region.evaluate(element => { element.scrollTop = 120; });
  const scroll = await region.evaluate(element => element.scrollTop);
  await page.getByRole('button', { name: copy.view, exact: true }).nth(2).click();
  await page.getByRole('button', { name: copy.back, exact: true }).click();
  await expect.poll(() => region.evaluate(element => element.scrollTop)).toBe(scroll);
  await page.screenshot({ path: info.outputPath('assignors-paginated.png'), fullPage: true });
});
