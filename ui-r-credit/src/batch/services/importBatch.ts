import { z } from 'zod';
import { previewSchema, invalidPreviewSchema } from './contracts';
import { totalFace } from './manualBatch';
export const maxImportBytes = 5 * 1024 * 1024;
export type ImportFormat = 'CSV' | 'CNAB';
export type ImportPreview = z.infer<typeof previewSchema>;
export type ImportIssue = z.infer<typeof invalidPreviewSchema>['details'][number];
export function validPreview(preview: ImportPreview, format: ImportFormat) {
  return preview.source === format && preview.itemCount > 0 && preview.itemCount <= 1000 && preview.itemCount === preview.items.length
    && new Set(preview.items.map(item => item.itemIndex)).size === preview.itemCount
    && preview.items.every((item, index) => item.itemIndex === index && (format !== 'CNAB' || item.paymentCurrency === 'BRL'))
    && preview.faceValueBrl === totalFace(preview.items);
}
export function importBody(file: File, format: ImportFormat, currencies?: Record<number, 'BRL' | 'USD'>) {
  const body = new FormData(); body.append('file', file); body.append('format', format);
  if (format === 'CNAB' && currencies) body.append('paymentCurrencies', new Blob([JSON.stringify(
    Object.entries(currencies).map(([itemIndex, paymentCurrency]) => ({ itemIndex: Number(itemIndex), paymentCurrency })),
  )], { type: 'application/json' }));
  return body;
}
