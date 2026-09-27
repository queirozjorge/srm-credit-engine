import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest';
import { server } from './server';
import { demoTime } from './demo';

beforeEach(() => { vi.useRealTimers(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(demoTime)); });
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  vi.useRealTimers();
});
afterAll(() => server.close());
