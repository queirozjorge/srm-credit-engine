import { test as base } from '@playwright/test';
import { demoTime } from '../tests/common/testing/demo';
// O relógio avança normalmente, mas cada cenário começa na data de suas fixtures.
export const test = base.extend<{ demoClock: void }>({
  demoClock: [async ({ page }, run) => {
    await page.clock.install({ time: new Date(demoTime) });
    await run();
  }, { auto: true }],
});
