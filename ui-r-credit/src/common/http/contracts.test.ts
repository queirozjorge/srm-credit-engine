import { expect, test } from 'vitest';
import { money, rate, date, pageOf } from './contracts';
import { requestSchema } from '../../settlement/services/contracts';
import { requestFixture } from '../../settlement/mocks/fixtures';
import { simulationInputSchema } from '../../pricing/services/contracts';
import { assignorSchema } from '../../register/services/contracts';
test('decimais são strings limitadas e datas impossíveis são rejeitadas', () => {
  expect(money.parse('99999999999999999.99')).toBe('99999999999999999.99');
  for (const value of [123.45, '1e3', '1,00', '100000000000000000.00', '1.001']) expect(money.safeParse(value).success).toBe(false);
  expect(rate.safeParse('0.123456789012').success).toBe(true);
  expect(rate.safeParse('0.1234567890123').success).toBe(false);
  expect(date.safeParse('2026-02-30').success).toBe(false);
});
test('solicitação pendente não pode expor resultado parcial e URL deve corresponder ao UUID', () => {
  expect(requestSchema.safeParse(requestFixture).success).toBe(true);
  expect(requestSchema.safeParse({ ...requestFixture, completedAt: '2026-09-26T12:00:00Z' }).success).toBe(false);
  expect(requestSchema.safeParse({ ...requestFixture, statusUrl: 'https://example.com' }).success).toBe(false);
  expect(requestSchema.safeParse({ ...requestFixture, status: 'SETTLED' }).success).toBe(false);
});
test('contratos rejeitam entradas ambíguas e envelopes incoerentes', () => {
  expect(simulationInputSchema.safeParse({ batchUuid: requestFixture.batchUuid, items: [] }).success).toBe(false);
  expect(pageOf(assignorSchema).safeParse({ items: [], page: 1, size: 20, totalItems: 10, totalPages: 0 }).success).toBe(false);
});
