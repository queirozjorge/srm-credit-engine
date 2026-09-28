import { test } from './isolatedTest';
import { expect, type Page } from '@playwright/test';
import { locale, translations } from '../tests/pt-BR';

const text = translations[locale];

async function gotoDemo(page: Page, path: string) {
  await page.goto(path);
  if (/^\/(dashboard|lotes|cedentes|cambio|extrato)/.test(path) || path === '/inexistente') {
    await page.getByRole('button', { name: text.demo.operator, exact: true }).click();
    if (path.startsWith('/dashboard')) {
      await expect(page.getByRole('group', { name: new RegExp(text.dashboard.chart) })).toBeVisible();
      await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
    }
  }
}

async function openNavigation(page: Page) {
  const button = page.getByRole('button', { name: text.app.openMenu, exact: true });
  if (await button.isVisible()) await button.click();
  const navigation = page.getByRole('navigation', { name: text.app.navigation });
  await expect(navigation).toBeVisible();
  await navigation.evaluate(async element => {
    const aside = element.parentElement;
    if (!aside) return;
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    await Promise.all(aside.getAnimations().map(animation => animation.finished.catch(() => undefined)));
  });
}

async function expectMobileNavigationClosed(page: Page) {
  const navigation = page.getByRole('navigation', { name: text.app.navigation });
  await expect(navigation).toHaveAttribute('inert', '');
  await expect.poll(() => navigation.evaluate(element => element.parentElement?.getBoundingClientRect().height)).toBe(0);
}

test('menu recolhe e reabre cinco vezes; Escape restaura o foco', async ({ page }, info) => {
  await gotoDemo(page, '/dashboard');
  const main = page.getByRole('main');
  for (let cycle = 0; cycle < 5; cycle += 1) {
    await openNavigation(page);
    if (info.project.name === 'desktop-chromium') {
      await expect.poll(async () => (await main.boundingBox())?.x).toBe(232);
    }
    const before = await main.boundingBox();
    await page.getByRole('button', { name: text.app.closeMenu, exact: true }).click();
    if (info.project.name === 'desktop-chromium') {
      const navigation = page.getByRole('navigation', { name: text.app.navigation });
      await expect(navigation).toBeVisible();
      await expect(navigation.getByRole('link', { name: text.batch.list.title, exact: true })).toBeVisible();
      await expect.poll(async () => (await navigation.boundingBox())?.width).toBe(72);
    } else {
      await expectMobileNavigationClosed(page);
    }
    if (info.project.name === 'desktop-chromium') {
      await expect.poll(async () => (await main.boundingBox())?.width ?? 0).toBeGreaterThan(before?.width ?? 0);
    }
  }
  await openNavigation(page);
  await page.getByRole('navigation').getByRole('link', { name: text.batch.list.title, exact: true }).focus();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: text.app.openMenu, exact: true })).toBeFocused();
  if (info.project.name === 'desktop-chromium') {
    await expect(page.getByRole('navigation', { name: text.app.navigation })).toBeVisible();
    await expect.poll(async () => (await page.getByRole('navigation').boundingBox())?.width).toBe(72);
  } else {
    await expectMobileNavigationClosed(page);
  }
});

test('preserva consulta e scroll ao voltar pelo menu e pelo histórico', async ({ page }, info) => {
  const source = '/lotes?q=Acme&status=PENDING&page=3&size=20';
  await gotoDemo(page, source);
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  await page.addStyleTag({ content: '#page-content { min-height: 1800px; } #page-content::after { content: ""; display: block; flex: 0 0 1800px; height: 1800px; } @media (min-width: 900px) { #page-content { min-height: 0; max-height: calc(100dvh - 88px); overflow-y: auto !important; } }' });
  await openNavigation(page);
  const readScroll = () => page.evaluate(() => {
    const content = document.querySelector<HTMLElement>('#page-content');
    return window.innerWidth >= 900 ? content?.scrollTop ?? 0 : window.scrollY;
  });
  const setScroll = () => page.evaluate(() => {
    if (window.innerWidth >= 900) document.querySelector<HTMLElement>('#page-content')?.scrollTo(0, 350);
    else window.scrollTo(0, 350);
  });
  await setScroll();
  await expect.poll(readScroll).toBe(350);
  if (info.project.name === 'desktop-chromium') {
    const metrics = await page.locator('#page-content').evaluate(element => ({ scrollTop: element.scrollTop,
      scrollHeight: element.scrollHeight, clientHeight: element.clientHeight,
      overflowY: getComputedStyle(element).overflowY, height: element.getBoundingClientRect().height }));
    expect(metrics.scrollTop, JSON.stringify(metrics)).toBe(350);
  }
  await page.getByRole('navigation').getByRole('link', { name: text.settlement.statement.title, exact: true }).click();
  await expect(page).toHaveURL(/\/extrato$/);
  await openNavigation(page);
  await page.getByRole('navigation').getByRole('link', { name: text.batch.list.title, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(source.replaceAll('?', '\\?')));
  await expect.poll(readScroll).toBe(350);
  await page.goBack();
  await expect(page).toHaveURL(/\/extrato$/);
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(source.replaceAll('?', '\\?')));
  await expect.poll(readScroll).toBe(350);
});

test('rotas diretas, retorno do detalhe e página inexistente', async ({ page }) => {
  const routes = [
    ['/lotes/novo', text.batch.create.title], ['/lotes/00000000-0000-4000-8000-000000000002', text.batch.detail.title],
    ['/cedentes?cedente=00000000-0000-4000-8000-000000000001', text.register.title], ['/cambio?history=quotes&page=2', text.exchange.title],
    ['/extrato', text.settlement.statement.title], ['/entrar', text.auth.signIn.title],
    ['/?code=example', text.auth.callback.title], ['/sessao-expirada', text.auth.expired.title],
    ['/acesso-negado', text.auth.forbidden.title], ['/inexistente', text.app.notFound.title],
  ] as const;
  for (const [route, title] of routes) {
    await gotoDemo(page, route);
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(page).toHaveTitle(`${title} · ${text.app.name}`);
  }
  await page.getByRole('link', { name: text.app.backToDashboard, exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await gotoDemo(page, '/lotes/00000000-0000-4000-8000-000000000002');
  await page.getByRole('link', { name: text.batch.back, exact: true }).click();
  await expect(page).toHaveURL(/\/lotes$/);
});

test('layout adapta larguras, texto ampliado e movimento reduzido', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await gotoDemo(page, '/dashboard');
  for (const width of [320, 390, 430, 1366, 1920]) {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 1080 });
    await expect(page.getByRole('button', { name: text.app.openMenu, exact: true })).toBeVisible();
    await openNavigation(page);
    await expect(page.getByRole('heading', { level: 1, name: text.dashboard.title })).toBeVisible();
    if (width < 900) {
      await expect.poll(async () => (await page.getByRole('navigation').boundingBox())?.width).toBe(width);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('button', { name: text.app.closeMenu, exact: true }).click();
    if (width >= 900) {
      await expect(page.getByRole('navigation', { name: text.app.navigation })).toBeVisible();
      await expect.poll(async () => (await page.getByRole('navigation').boundingBox())?.width).toBe(72);
    } else {
      await expectMobileNavigationClosed(page);
    }
  }
  await page.setViewportSize({ width: 683, height: 384 });
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  await openNavigation(page);
  await expect.poll(async () => (await page.getByRole('navigation').boundingBox())?.width).toBe(683);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('text-enlarged.png'), fullPage: true });
});

test('registra a apresentação do shell', async ({ page }, info) => {
  await gotoDemo(page, '/dashboard');
  await expect(page.getByRole('heading', { level: 1, name: text.dashboard.title })).toBeVisible();
  await page.screenshot({ path: info.outputPath('shell.png'), fullPage: true });
});
