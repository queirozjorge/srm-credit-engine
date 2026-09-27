import { defineConfig } from '@playwright/test';
import load from './playwright.load.config';

export default defineConfig({ ...load, testMatch: '**/settlement-race.spec.ts', timeout: 300_000,
  reporter: [['list'], ['json', { outputFile: 'test-results/race/playwright.json' }]],
  outputDir: 'test-results/race/browser' });
