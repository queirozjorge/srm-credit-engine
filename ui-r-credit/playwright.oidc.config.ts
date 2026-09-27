import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', testMatch: '**/oidc.spec.ts', fullyParallel: false, workers: 1, retries: 0,
  reporter: [['list']], timeout: 60_000,
  use: { baseURL: 'https://localhost:8443', ignoreHTTPSErrors: true, trace: 'off', screenshot: 'off', video: 'off' },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } } },
    { name: 'mobile-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
