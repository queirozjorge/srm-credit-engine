import { expect, test } from 'vitest';
import { generateDataset, loadAssignors } from './dataset';
import { validCnpj } from '../../src/register/services/validation';

const options = { seed: 'srm-load-20260927', calculationDate: '2026-09-27', batchNumber: 1, itemCount: 1000 };
test('gera 1.000 títulos reproduzíveis, dez CNPJs válidos e referências sem colisões', () => {
  const first = generateDataset(options);
  expect(first).toEqual(generateDataset(options));
  expect(first.assignors).toHaveLength(10);
  expect(first.assignors.every(assignor => validCnpj(assignor.documentNumber))).toBe(true);
  expect(new Set(first.assignors.map(assignor => assignor.documentNumber)).size).toBe(10);
  expect(new Set(first.items.map(item => item.externalReference)).size).toBe(1000);
  expect(first.items.every(item => item.externalReference.length === 15)).toBe(true);
  expect(first.items.filter(item => item.type === 'CHEQUE_PRE_DATADO')).toHaveLength(500);
  expect(first.csv.split('\r\n')).toHaveLength(1002);
  const other = generateDataset({ ...options, batchNumber: 2 });
  expect(other.assignors).toEqual(first.assignors);
  expect(other.items.some(item => first.items.some(previous => previous.externalReference === item.externalReference))).toBe(false);
});

test('CNAB contém registros ASCII 240, dez lotes, pares P/Q e trailers consistentes', () => {
  const data = generateDataset({ ...options, includeUsd: true });
  const records = data.cnab.trimEnd().split('\r\n');
  // Preserve the final trailer's spaces when validating record widths.
  expect(data.cnab.split('\r\n').slice(0, -1).every(line => line.length === 240 && /^[\x20-\x7e]+$/.test(line))).toBe(true);
  expect(records).toHaveLength(2022);
  expect(records[0]?.slice(163, 166)).toBe('103');
  expect(records.at(-1)?.slice(17, 23)).toBe('000010');
  expect(records.at(-1)?.slice(23, 29)).toBe('002022');
  expect(records.filter(line => line[7] === '1')).toHaveLength(10);
  expect(records.filter(line => line[13] === 'P')).toHaveLength(1000);
  expect(records.filter(line => line[13] === 'Q')).toHaveLength(1000);
  expect(records.filter(line => line[7] === '5').every(line => line.slice(17, 23) === '000202')).toBe(true);
  const p = records.filter(line => line[13] === 'P');
  expect(p.map(line => line.slice(62, 77))).toEqual(data.cnabItems.map(item => item.externalReference));
  expect(p.every(line => line.slice(227, 229) === '09')).toBe(true);
  expect(data.manifest.paymentCurrencies).toHaveLength(200);
});

test('aceita fronteira negativa de 1.001 e rejeita parâmetros que truncariam o layout', () => {
  expect(generateDataset({ ...options, itemCount: 1001 }).items).toHaveLength(1001);
  expect(() => generateDataset({ ...options, itemCount: 0 })).toThrow();
  expect(() => generateDataset({ ...options, batchNumber: 1000 })).toThrow();
  expect(() => generateDataset({ ...options, calculationDate: '2026-02-30' })).toThrow();
  expect(() => loadAssignors('', 10)).toThrow();
});
