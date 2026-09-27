import { defineConfig } from '@playwright/test';
import base from './playwright.oidc.config';
export default defineConfig({ ...base, testMatch: '**/engine-integration.spec.ts', timeout: 120_000 });
