import { expect, test } from 'vitest';
import { financialToday, inputOf, totalFace, validateManual } from './manualBatch';
import { receivableFixture } from '../../../tests/batch/mocks/fixtures';
const item = { ...receivableFixture, dueDate: '2099-12-31' };
test('limites de quantidade, referência normalizada e duplicidade composta', () => {
  expect(validateManual([])).toBe('count');
  expect(validateManual([item])).toBeNull();
  const thousand = Array.from({ length: 1000 }, (_, i) => ({ ...item, externalReference: String(i) }));
  expect(validateManual(thousand)).toBeNull();
  expect(validateManual([...thousand, item])).toBe('count');
  expect(validateManual([item, { ...item, externalReference: ` ${item.externalReference} ` }])).toBe('duplicate');
  expect(validateManual([item, { ...item, type: 'CHEQUE_PRE_DATADO' }])).toBeNull();
  expect(inputOf({ ...item, externalReference: ' 0000123 ' }).externalReference).toBe('0000123');
  expect(Object.keys(inputOf(item))).toHaveLength(6);
});
test('dinheiro e totais preservam precisão no limite NUMERIC(19,2)', () => {
  const max = { ...item, faceValueBrl: '99999999999999999.99' };
  expect(validateManual([max])).toBeNull();
  expect(totalFace([max])).toBe('99999999999999999.99');
  expect(validateManual([max, { ...item, externalReference: 'outra', faceValueBrl: '0.01' }])).toBe('total');
  expect(validateManual([{ ...item, faceValueBrl: '0.00' }])).toBe('invalid');
  expect(validateManual([{ ...item, faceValueBrl: '1.001' }])).toBe('invalid');
});
test('vencimento considera calendário de São Paulo e é revalidado no envio', () => {
  expect(financialToday(new Date('2026-09-27T01:00:00Z'))).toBe('2026-09-26');
  expect(validateManual([{ ...item, dueDate: '2026-09-26' }], '2026-09-26')).toBeNull();
  expect(validateManual([{ ...item, dueDate: '2026-09-26' }], '2026-09-27')).toBe('expired');
  expect(validateManual([{ ...item, dueDate: '2026-02-30' }])).toBe('invalid');
});
