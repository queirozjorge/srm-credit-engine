import { expect, test } from '@playwright/test';
import { locale, translations } from '../tests/pt-BR';

test('abre o build de produção sem erros ou transbordamento horizontal', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto('/');
  await expect(page).toHaveTitle(`${translations[locale].auth.signIn.title} · ${translations[locale].app.name}`);
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
  await expect(page.getByRole('heading', {
    level: 1, name: translations[locale].auth.signIn.title,
  })).toBeVisible();
  expect(await page.evaluate(() =>
    document.documentElement.scrollWidth <= window.innerWidth,
  )).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: info.outputPath('access.png'), fullPage: true });
});

test('modo real não ativa demonstração ou worker', async ({ page }) => {
  await page.goto('/lotes/novo');
  await expect(page).toHaveURL(/\/entrar$/);
  await expect(page.getByText(translations[locale].auth.loginDescription)).toBeVisible();
  await expect(page.getByRole('button', { name: translations[locale].demo.operator })).toHaveCount(0);
  expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
});
