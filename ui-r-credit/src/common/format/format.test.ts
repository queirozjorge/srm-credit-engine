import { expect, test } from 'vitest';
import { formatDecimal, moneyFormat, normalizeDecimal, parseDecimalInput, rateFormat } from './decimal';
import { formatCivilDate, formatInstant, isCivilDate } from './dates';
import { formatCnpj, normalizeCnpj } from './document';

test('preserva todos os dígitos monetários nos limites do contrato', () => {
  const value = '99999999999999999.99';
  expect(formatDecimal(value, moneyFormat)).toBe('99.999.999.999.999.999,99');
  expect(parseDecimalInput('R$ 99.999.999.999.999.999,99', moneyFormat)).toBe(value);
  expect(parseDecimalInput('0,01', moneyFormat)).toBe('0.01');
  expect(parseDecimalInput('00012,5', moneyFormat)).toBe('12.50');
  expect(normalizeDecimal('100000000000000000.00', moneyFormat)).toBeNull();
});

test('rejeita escala excedida e formatos ambíguos sem arredondar', () => {
  for (const value of ['1,001', '1.23', '12abc', '1e3', '1,2,3', '-1,00']) {
    expect(parseDecimalInput(value, moneyFormat)).toBeNull();
  }
  expect(parseDecimalInput('-1,23', { ...moneyFormat, allowNegative: true })).toBe('-1.23');
  expect(parseDecimalInput('-0,00', { ...moneyFormat, allowNegative: true })).toBe('0.00');
});

test('taxas mantêm até doze casas, sem passar por ponto flutuante', () => {
  expect(parseDecimalInput('999999999999,123456789012', rateFormat)).toBe('999999999999.123456789012');
  expect(parseDecimalInput('0,000000000001', rateFormat)).toBe('0.000000000001');
  expect(parseDecimalInput('0,1234567890123', rateFormat)).toBeNull();
});

test('documentos preservam zeros e letras; máscara não valida identidade', () => {
  expect(normalizeCnpj('00.123.456/0001-90')).toBe('00123456000190');
  expect(formatCnpj('00123456000190')).toBe('00.123.456/0001-90');
  expect(normalizeCnpj('ab.123.456/abcd-90')).toBe('AB123456ABCD90');
  expect(normalizeCnpj('123456789012345')).toBeNull();
});

test('datas civis não mudam de dia; instantes usam São Paulo', () => {
  expect(formatCivilDate('2024-02-29')).toBe('29/02/2024');
  expect(isCivilDate('2025-02-29')).toBe(false);
  expect(isCivilDate('2026-13-01')).toBe(false);
  expect(formatInstant('2026-09-26T01:00:00Z')).toContain('25/09/2026');
  expect(formatInstant('2026-09-26T01:00:00Z')).toContain('22:00');
});
