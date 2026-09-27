import { expect, test } from 'vitest';
import { batchFixture } from '../../../tests/batch/mocks/fixtures';
import { batchSummarySchema } from './contracts';

test('resumo exige contagens que expliquem o estado agregado do lote', () => {
  const partial = { ...batchFixture, status: 'PARTIALLY_SETTLED', itemCount: 2,
    counts: { ready: 0, pending: 0, settled: 1, failed: 1 } };
  expect(batchSummarySchema.safeParse(partial).success).toBe(true);
  expect(batchSummarySchema.safeParse({ ...partial, counts: { ...partial.counts, pending: 1 } }).success).toBe(false);
  expect(batchSummarySchema.safeParse({ ...batchFixture, counts: { ...batchFixture.counts, ready: 0 } }).success).toBe(false);
});
