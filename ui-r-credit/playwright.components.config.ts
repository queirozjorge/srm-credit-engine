import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: '**/components.spec.ts',
  use: { ...base.use, baseURL: 'http://127.0.0.1:5176' },
  webServer: {
    command: 'npm run dev -- --port 5176',
    url: 'http://127.0.0.1:5176/e2e/fixtures/components.html',
    reuseExistingServer: false,
  },
});
