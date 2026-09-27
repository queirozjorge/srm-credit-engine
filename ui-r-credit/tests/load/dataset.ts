/// <reference types="node" />
import { createHash } from 'node:crypto';

export interface LoadAssignor { name: string; documentNumber: string }
export interface LoadItem {
  documentNumber: string;
  externalReference: string;
  type: 'DUPLICATA_MERCANTIL' | 'CHEQUE_PRE_DATADO';
  faceValueBrl: string;
  dueDate: string;
  paymentCurrency: 'BRL' | 'USD';
}
export interface DatasetOptions {
  seed: string;
  calculationDate: string;
  batchNumber: number;
  itemCount: number;
  assignorCount?: number;
  includeUsd?: boolean;
}
export const csvHeader = 'cedente_documento;referencia_externa;tipo;valor_face;vencimento;moeda_pagamento';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const decimal = (cents: bigint) => `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;

export function loadAssignors(seed: string, count = 10): LoadAssignor[] {
  if (!seed || !Number.isInteger(count) || count < 1 || count > 1000) throw new Error('Massa exige seed e 1–1.000 cedentes.');
  return Array.from({ length: count }, (_, index) => {
    const base = (BigInt(`0x${digest(`${seed}:assignor:${index}`).slice(0, 12)}`) % 900000000000n + 100000000000n).toString();
    const digits = [...base].map(Number);
    for (const weights of [[5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]]) {
      const remainder = digits.reduce((sum, digit, position) => sum + digit * weights[position]!, 0) % 11;
      digits.push(remainder < 2 ? 0 : 11 - remainder);
    }
    return { name: `Carga ${seed.slice(0, 32)} ${String(index + 1).padStart(2, '0')}`, documentNumber: digits.join('') };
  });
}

export function generateDataset(options: DatasetOptions) {
  const { seed, calculationDate, batchNumber, itemCount, includeUsd = false } = options;
  if (!Number.isInteger(itemCount) || itemCount < 1 || itemCount > 1001) throw new Error('Quantidade suportada: 1–1.001 títulos, incluindo fronteira negativa.');
  if (!Number.isInteger(batchNumber) || batchNumber < 0 || batchNumber > 999) throw new Error('Número do lote deve estar entre 0 e 999.');
  const baseDate = new Date(`${calculationDate}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(calculationDate) || !Number.isFinite(baseDate.getTime()) || baseDate.toISOString().slice(0, 10) !== calculationDate) throw new Error('Data-base inválida.');
  const assignors = loadAssignors(seed, Math.min(options.assignorCount ?? 10, itemCount));
  const days = [0, 1, 29, 30, 31, 60, 90];
  const prefix = `${digest(seed).slice(0, 8).toUpperCase()}${String(batchNumber).padStart(3, '0')}`;
  const items: LoadItem[] = Array.from({ length: itemCount }, (_, index) => ({
    documentNumber: assignors[index % assignors.length]!.documentNumber,
    externalReference: `${prefix}${String(index + 1).padStart(4, '0')}`,
    type: index % 2 ? 'CHEQUE_PRE_DATADO' : 'DUPLICATA_MERCANTIL',
    faceValueBrl: decimal(10000n + BigInt(index * 7919 + batchNumber * 101) % 99990001n),
    dueDate: new Date(baseDate.getTime() + days[index % days.length]! * 86400000).toISOString().slice(0, 10),
    paymentCurrency: includeUsd && index % 5 === 0 ? 'USD' : 'BRL',
  }));
  const csv = `${csvHeader}\r\n${items.map(item => [item.documentNumber, item.externalReference, item.type, item.faceValueBrl, item.dueDate, item.paymentCurrency].join(';')).join('\r\n')}\r\n`;
  // CNAB groups titles by assignor; itemIndex refers to this order during UI review.
  const cnabItems = assignors.flatMap(assignor => items.filter(item => item.documentNumber === assignor.documentNumber));
  const cnab = encodeCnab(assignors, cnabItems);
  const total = items.reduce((sum, item) => sum + BigInt(item.faceValueBrl.replace('.', '')), 0n);
  return { assignors, items, cnabItems, csv, cnab, manifest: {
    seed, calculationDate, batchNumber, itemCount, assignorCount: assignors.length,
    faceValueBrl: decimal(total), csvSha256: digest(csv), cnabSha256: digest(cnab),
    paymentCurrencies: cnabItems.flatMap((item, itemIndex) => item.paymentCurrency === 'USD' ? [{ itemIndex, paymentCurrency: item.paymentCurrency }] : []),
  } };
}

function record(fields: [number, number, string][]) {
  const line = Array<string>(240).fill(' ');
  for (const [start, end, value] of fields) {
    if (value.length > end - start + 1 || !/^[\x20-\x7e]*$/.test(value)) throw new Error('Campo incompatível com CNAB 240.');
    [...value.padEnd(end - start + 1)].forEach((character, index) => { line[start - 1 + index] = character; });
  }
  return line.join('');
}

function encodeCnab(assignors: LoadAssignor[], items: LoadItem[]) {
  const bank = '001';
  const lines = [record([[1, 8, `${bank}00000`], [143, 143, '1'], [164, 166, '103']])];
  assignors.forEach((assignor, index) => {
    const lot = String(index + 1).padStart(4, '0');
    const titles = items.filter(item => item.documentNumber === assignor.documentNumber);
    lines.push(record([[1, 7, `${bank}${lot}`], [8, 16, '1R01  060'], [18, 18, '2'], [19, 33, `0${assignor.documentNumber}`]]));
    titles.forEach((item, titleIndex) => {
      const [year, month, day] = item.dueDate.split('-');
      lines.push(record([[1, 8, `${bank}${lot}3`], [9, 13, String(titleIndex * 2 + 1).padStart(5, '0')],
        [14, 14, 'P'], [16, 17, '01'], [63, 77, item.externalReference], [78, 85, `${day}${month}${year}`],
        [86, 100, item.faceValueBrl.replace('.', '').padStart(15, '0')], [107, 108, item.type === 'CHEQUE_PRE_DATADO' ? '01' : '02'],
        [118, 118, '3'], [119, 195, '0'.repeat(77)], [228, 229, '09']]));
      lines.push(record([[1, 8, `${bank}${lot}3`], [9, 13, String(titleIndex * 2 + 2).padStart(5, '0')], [14, 14, 'Q'], [16, 17, '01']]));
    });
    lines.push(record([[1, 8, `${bank}${lot}5`], [18, 23, String(titles.length * 2 + 2).padStart(6, '0')]]));
  });
  lines.push(record([[1, 8, `${bank}99999`], [18, 23, String(assignors.length).padStart(6, '0')], [24, 29, String(lines.length + 1).padStart(6, '0')]]));
  return `${lines.join('\r\n')}\r\n`;
}
