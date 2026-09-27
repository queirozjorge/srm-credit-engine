import { defineConfig } from '@playwright/test';
import base from './playwright.config';
export default defineConfig({ ...base, testMatch: ['**/reports.spec.ts', '**/exchange.spec.ts', '**/settlement.spec.ts', '**/navigation.spec.ts', '**/session.spec.ts', '**/register.spec.ts', '**/batch.spec.ts', '**/manual-batch.spec.ts', '**/import-batch.spec.ts'],
  use: { ...base.use, baseURL: 'http://127.0.0.1:5177' },
  webServer: { command: 'npx vite --config vite.isolated.config.ts --port 5177', url: 'http://127.0.0.1:5177', reuseExistingServer: false },
});
