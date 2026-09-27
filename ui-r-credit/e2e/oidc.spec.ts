import { test, expect } from '@playwright/test';
import { translations, locale } from '../tests/pt-BR';
const text = translations[locale];
// Jornada contra gateway, Keycloak e APIs reais; nenhuma interceptação de negócio.
for (const profile of ['operador', 'gestor'] as const) test(`${profile}: login real, PKCE, renovação, Bearer e logout`, async ({ page }, info) => {
  const password = process.env[profile === 'operador' ? 'KEYCLOAK_OPERATOR_PASSWORD' : 'KEYCLOAK_MANAGER_PASSWORD'];
  test.skip(!password, 'Defina as credenciais locais de teste do realm.');
  const grants: string[] = []; let bearer = false;
  page.on('request', request => {
    if (new URL(request.url()).pathname.endsWith('/token')) grants.push(new URLSearchParams(request.postData() ?? '').get('grant_type') ?? '');
    if (new URL(request.url()).pathname === '/api/dashboard') bearer = /^Bearer [^.]+\.[^.]+\.[^.]+$/.test(request.headers().authorization ?? '');
  });
  await page.clock.install();
  await page.goto('/dashboard?currency=USD');
  await expect(page.getByRole('button', { name: text.auth.login, exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath(`access-${profile}.png`), fullPage: true });
  await page.getByRole('button', { name: text.auth.login, exact: true }).click();
  await expect(page.locator('input[name="username"]')).toBeVisible();
  const auth = new URL(page.url()); expect(auth.searchParams.get('code_challenge_method')).toBe('S256'); expect(auth.searchParams.get('redirect_uri')).toBe('https://localhost:8443/');
  await page.locator('input[name="username"]').fill(profile); await page.locator('input[name="password"]').fill(password!);
  await page.locator('input[type="submit"],button[type="submit"]').first().click();
  await expect(page).toHaveURL('https://localhost:8443/dashboard?currency=USD');
  await expect(page.getByRole('img', { name: new RegExp(text.dashboard.chart) })).toBeVisible();
  expect(bearer).toBe(true); expect(grants).toEqual(['authorization_code']);
  await expect(page.getByRole('link', { name: text.batch.create.title, exact: true })).toHaveCount(profile === 'operador' ? 1 : 0);
  expect(await page.evaluate(() => [...Object.values(localStorage), ...Object.values(sessionStorage)].some(value => /eyJ[A-Za-z0-9_-]+\./.test(value)))).toBe(false);
  await page.clock.fastForward(275_000);
  await expect.poll(() => grants.filter(grant => grant === 'refresh_token').length).toBe(1);
  await expect(page).toHaveURL('https://localhost:8443/dashboard?currency=USD');
  await expect(page.getByRole('tab', { name: text.dashboard.currencies.USD })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: text.auth.signOut, exact: true }).click();
  await expect(page.getByRole('button', { name: text.auth.login, exact: true })).toBeVisible();
  await page.getByRole('button', { name: text.auth.login, exact: true }).click();
  await expect(page.locator('input[name="username"]')).toBeVisible();
});
test('callback inválido é limpo e erro usa aviso acessível', async ({ page }) => {
  await page.goto('/?code=invalid&state=invalid');
  await expect(page).toHaveURL('https://localhost:8443/entrar');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText(text.auth.failed)).toBeVisible();
  await page.getByRole('button', { name: text.common.understood }).click();
  await expect(page.getByRole('button', { name: text.auth.login, exact: true })).toBeVisible();
});
test('entrada real aceita cliente público, retorno na raiz e desafio PKCE', async ({ page }) => {
  await page.goto('/dashboard');
  await page.getByRole('button', { name: text.auth.login, exact: true }).click();
  await expect(page.locator('input[name="username"]')).toBeVisible();
  await expect(page.locator('input[name="password"]')).toBeVisible();
  const url = new URL(page.url());
  expect(url.pathname).toBe('/auth/realms/srm-credit/protocol/openid-connect/auth');
  expect(url.searchParams.get('client_id')).toBe('ui-r-credit');
  expect(url.searchParams.get('redirect_uri')).toBe('https://localhost:8443/');
  expect(url.searchParams.get('code_challenge_method')).toBe('S256');
});
