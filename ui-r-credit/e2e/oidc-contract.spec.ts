import { createHash } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { dashboardFixture } from '../tests/dashboard/mocks/fixtures';
import { translations, locale } from '../tests/pt-BR';
const text = translations[locale];
const jwt = (claims: object) => `${Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.test-signature`;
// Provedor contratual sem credenciais: exercita o adaptador real e valida PKCE/state/nonce.
// Não substitui a suíte opcional contra Keycloak real.
for (const scenario of ['success', 'invalid-state', 'invalid-nonce'] as const) test(`OIDC contratual: ${scenario}`, async ({ page, baseURL }) => {
  let nonce = ''; let challenge = ''; let exchanged = 0; let refreshed = 0; let failRefresh = false; let bearer = false;
  await page.clock.install();
  await page.route('**/auth/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/auth')) {
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
      expect(url.searchParams.get('response_type')).toBe('code');
      nonce = url.searchParams.get('nonce')!; challenge = url.searchParams.get('code_challenge')!;
      return route.fulfill({ status: 302, headers: { location: `${baseURL}/?code=contract-code&state=${scenario === 'invalid-state' ? 'incorrect' : url.searchParams.get('state')}` } });
    }
    if (url.pathname.endsWith('/token')) {
      const form = new URLSearchParams(route.request().postData() ?? '');
      if (form.get('grant_type') === 'authorization_code') {
        exchanged++; expect(createHash('sha256').update(form.get('code_verifier')!).digest('base64url')).toBe(challenge);
        expect(form.get('redirect_uri')).toBe(`${baseURL}/`);
      } else { refreshed++; if (failRefresh) return route.fulfill({ status: 400, json: { error: 'invalid_grant' } }); }
      const claims = { iss: `${baseURL}/auth/realms/srm-credit`, sub: 'contract-operator', azp: 'ui-r-credit', aud: 'spe-j-engine', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300, realm_access: { roles: ['OPERADOR'] } };
      return route.fulfill({ json: { access_token: jwt(claims), refresh_token: jwt({ ...claims, exp: claims.exp + 900 }), id_token: jwt({ ...claims, nonce: scenario === 'invalid-nonce' ? 'incorrect' : nonce }), expires_in: 300, refresh_expires_in: 1200, token_type: 'Bearer' } });
    }
    return route.fulfill({ status: 404 });
  });
  await page.route('**/api/dashboard*', route => { bearer = /^Bearer eyJ/.test(route.request().headers().authorization ?? ''); return route.fulfill({ json: dashboardFixture }); });
  await page.goto('/dashboard?currency=USD');
  await page.getByRole('button', { name: text.auth.login, exact: true }).click();
  if (scenario !== 'success') {
    await expect(page.getByRole('dialog')).toBeVisible(); await expect(page.getByText(text.auth.failed)).toBeVisible();
    expect(exchanged).toBe(scenario === 'invalid-state' ? 0 : 1); expect(bearer).toBe(false);
    expect(new URL(page.url()).search).toBe(''); return;
  }
  await expect(page.getByRole('group', { name: new RegExp(text.dashboard.chart) })).toBeVisible(); expect(bearer).toBe(true); expect(exchanged).toBe(1);
  await expect(page).toHaveURL(`${baseURL}/dashboard?currency=USD`);
  await page.clock.fastForward(275_000); await expect.poll(() => refreshed).toBe(1);
  await expect(page).toHaveURL(`${baseURL}/dashboard?currency=USD`);
  await expect(page.getByRole('tab', { name: text.dashboard.currencies.USD })).toHaveAttribute('aria-selected', 'true');
  expect(await page.evaluate(() => [...Object.values(localStorage), ...Object.values(sessionStorage)].some(value => /eyJ[A-Za-z0-9_-]+\./.test(value)))).toBe(false);
  failRefresh = true; await page.clock.fastForward(275_000);
  await expect(page).toHaveURL(`${baseURL}/sessao-expirada`);
  await expect(page.getByRole('heading', { name: text.auth.expired.title })).toBeVisible();
});
