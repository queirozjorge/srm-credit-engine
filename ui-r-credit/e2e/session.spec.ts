import { test } from './isolatedTest';
import { expect } from '@playwright/test';
import { locale, translations } from '../tests/pt-BR';
const text = translations[locale];
test('perfil gestor não acessa cadastro de lote; operador retoma destino com filtros', async ({ page }, info) => {
  await page.goto('/lotes/novo');
  await expect(page.getByText(text.demo.label)).toBeVisible();
  await page.screenshot({ path: info.outputPath('sign-in-demo.png'), fullPage: true });
  await page.getByRole('button', { name: text.demo.manager, exact: true }).click();
  await expect(page.getByRole('heading', { name: text.auth.forbidden.title })).toBeVisible();
  await page.getByRole('link', { name: text.app.backToDashboard }).click();
  await page.getByRole('button', { name: text.demo.signOut, exact: true }).click();
  await expect(page.getByRole('heading', { name: text.auth.signIn.title })).toBeVisible();
  await page.goto('/lotes?q=Exemplo&page=3');
  await page.getByRole('button', { name: text.demo.operator, exact: true }).click();
  await expect(page).toHaveURL(/\/lotes\?q=Exemplo&page=3$/);
  await page.reload();
  await expect(page.getByRole('heading', { name: text.auth.signIn.title })).toBeVisible();
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
});
test('worker demonstra contrato e bloqueia chamadas sem perfil', async ({ page }) => {
  await page.goto('/entrar');
  await expect(page.getByRole('button', { name: text.demo.operator, exact: true })).toBeVisible();
  const statuses = await page.evaluate(async () => {
    const anonymous = await fetch('/api/assignors');
    const known = await fetch('/api/assignors', { headers: { 'X-Demo-Subject': 'operador-demo' } });
    const missing = await fetch('/api/unknown', { headers: { 'X-Demo-Subject': 'operador-demo' } });
    return [anonymous.status, known.status, missing.status];
  });
  expect(statuses).toEqual([401, 200, 404]);
});
test('falha ao iniciar mocks abre aviso e permite nova tentativa sem modo real', async ({ page }) => {
  await page.addInitScript(() => {
    const container = navigator.serviceWorker;
    const register = container.register.bind(container);
    let failed = false;
    Object.defineProperty(container, 'register', { configurable: true, value: (...args: Parameters<ServiceWorkerContainer['register']>) => {
      if (!failed) { failed = true; return Promise.reject(new Error('Demo startup test')); }
      return register(...args);
    } });
  });
  await page.goto('/entrar');
  await expect(page.getByRole('dialog')).toContainText(text.demo.startupError);
  await expect(page.getByRole('button', { name: text.demo.operator })).toHaveCount(0);
  await page.getByRole('button', { name: text.common.understood }).click();
  await page.getByRole('button', { name: text.demo.retry }).click();
  await expect(page.getByRole('button', { name: text.demo.operator })).toBeVisible();
});
