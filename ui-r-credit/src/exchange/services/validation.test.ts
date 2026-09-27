import { expect, test } from 'vitest';
import { addRate, exchangeFilters } from './validation';
import { currentQuote } from '../../../tests/exchange/mocks/handlers';
import { quoteFixture } from '../../../tests/exchange/mocks/fixtures';
test('incremento exato sem ponto flutuante e sem exceder NUMERIC(24,12)', () => {
  expect(addRate('5.1', '0.000000000001')).toBe('5.100000000001');
  expect(addRate('999999999999.999999999998', '0.000000000001')).toBe('999999999999.999999999999');
  expect(addRate('999999999999.999999999999', '0.000000000001')).toBeNull();
  expect(addRate('5', '0')).toBeNull(); expect(addRate('5', '-1')).toBeNull();
});
test('cotação inclui fronteira de 24 horas; ignora futura e distingue ausência', () => {
  expect(currentQuote([quoteFixture], Date.parse(quoteFixture.validUntil)).currentStatus).toBe('VALID');
  expect(currentQuote([quoteFixture], Date.parse(quoteFixture.validUntil) + 1).currentStatus).toBe('EXPIRED');
  expect(currentQuote([quoteFixture], Date.parse(quoteFixture.effectiveFrom) - 1).currentStatus).toBe('ABSENT');
  expect(currentQuote([], Date.now()).current).toBeNull();
});
test('filtros não enviam estado de proposta na aba de cotações', () => {
  expect(exchangeFilters(new URLSearchParams('history=quotes&status=PENDING&page=-1&size=1000'))).toEqual({ history: 'quotes', status: undefined, page: 1, size: 20 });
});
