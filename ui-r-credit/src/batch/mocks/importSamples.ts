import type { ImportFormat } from '../services/importBatch';
import { assignorFixture } from '../../register/mocks/fixtures';
// Fixtures de transporte: o parser CSV/CNAB real pertence ao serviço externo.
export const csvHeader = 'cedente_documento;referencia_externa;tipo;valor_face;vencimento;moeda_pagamento';
export function sampleContents(format: ImportFormat, invalid = false) {
  if (format === 'CNAB') return `SRM-DEMONSTRACAO-CNAB-${invalid ? 'INVALIDO' : 'VALIDO'}`.padEnd(240, ' ');
  return `${csvHeader}\n${assignorFixture.documentNumber};CSV-0001;DUPLICATA_MERCANTIL;1000.00;2099-12-31;BRL\n${assignorFixture.documentNumber};${invalid ? '' : 'CSV-0002'};CHEQUE_PRE_DATADO;2000.00;2099-12-31;USD\n`;
}
export function sampleFile(format: ImportFormat, invalid = false) {
  return new File([sampleContents(format, invalid)], `srm-demonstracao.${format === 'CSV' ? 'csv' : 'cnab'}`, { type: 'text/plain' });
}
