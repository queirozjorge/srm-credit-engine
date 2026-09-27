import { expect, test } from 'vitest';
import { statementFilters, statementQuery } from './statementFilters';
import { demoUuid } from '../../common/testing/demo';
import { filterStatement, type LedgerItem } from '../mocks/statementHandlers';
export const ledgerFixture: LedgerItem = { uuid: demoUuid(20), batchUuid: demoUuid(2), requestUuid: demoUuid(7), settledAt: '2026-09-26T03:00:00Z', receivableUuid: demoUuid(3), assignorUuid: demoUuid(1), assignorName: 'Cedente A', externalReference: 'A-001', paymentCurrency: 'BRL', faceValueBrl: '110.00', presentValueBrl: '100.00', paymentValue: '100.00' };
test('filtros convertem datas para UTC e permitem histórico sem limites', () => {
  expect(statementQuery(statementFilters(new URLSearchParams('from=2026-09-26&to=2026-09-27')))).toMatchObject({ start: '2026-09-26T03:00:00.000Z', end: '2026-09-27T03:00:00.000Z', page: 1, size: 20 });
  expect(statementFilters(new URLSearchParams('size=100')).size).toBe(100);
  expect(statementFilters(new URLSearchParams('size=5')).size).toBe(20);
  expect(statementQuery(statementFilters(new URLSearchParams('from=&to=')))).toMatchObject({ start: undefined, end: undefined });
  expect(statementQuery(statementFilters(new URLSearchParams('from=2026-09-27&to=2026-09-26')))).toBeNull();
  expect(statementQuery(statementFilters(new URLSearchParams('assignorUuid=invalido')))).toBeNull();
});
test('limites incluem início e excluem fim; cedente e moeda filtram itens do mesmo lote', () => {
  const other = { ...ledgerFixture, uuid: demoUuid(21), assignorUuid: demoUuid(9), paymentCurrency: 'USD' as const, paymentValue: '20.00' };
  const rows = [ledgerFixture, other, { ...ledgerFixture, uuid: demoUuid(22), settledAt: '2026-09-27T03:00:00Z' }, { ...ledgerFixture, uuid: demoUuid(23), settledAt: '2026-09-26T02:59:59Z' }];
  const range = { start: '2026-09-26T03:00:00Z', end: '2026-09-27T03:00:00Z' };
  expect(filterStatement(rows, range)).toHaveLength(2);
  expect(filterStatement(rows, { ...range, assignorUuid: demoUuid(9), paymentCurrency: 'USD' })).toEqual([other]);
});
