import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e', testMatch: '**/load-batches.spec.ts', fullyParallel: false, workers: 1, retries: 0,
  timeout: 60 * 60 * 1000,
  expect: { timeout: 30_000 },
  reporter: [['list'], ['json', { outputFile: 'test-results/load/playwright.json' }]],
  outputDir: 'test-results/load/browser',
  use: {
    baseURL: process.env.LOAD_BASE_URL ?? 'https://localhost:8443', ignoreHTTPSErrors: true,
    locale: 'pt-BR', timezoneId: 'America/Sao_Paulo',
    // Authenticated traces/HAR can contain secrets; diagnostic collection only stores safe metadata.
    trace: 'off', screenshot: 'off', video: 'off',
    channel: process.env.PLAYWRIGHT_CHANNEL,
  },
  projects: [{ name: 'load-desktop-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } } }],
});
