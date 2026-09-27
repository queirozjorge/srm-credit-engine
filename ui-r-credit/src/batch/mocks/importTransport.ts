import { z } from 'zod';
import { HttpResponse } from 'msw';
import { failure } from '../../common/testing/demo';
import { locale, translations } from '../../i18n/pt-BR';
import { receivableFixture } from './fixtures';
import { sampleContents } from './importSamples';
import { maxImportBytes, type ImportPreview } from '../services/importBatch';
import { inputOf } from '../services/manualBatch';
const currenciesSchema = z.array(z.strictObject({ itemIndex: z.number().int().min(0).max(999), paymentCurrency: z.enum(['BRL', 'USD']) })).max(1000);
export async function readImport(request: Request, previewOnly: boolean): Promise<{ preview: ImportPreview } | { error: Response }> {
  const text = translations[locale].batch.import;
  let form: FormData;
  try { form = await request.formData(); } catch { return { error: failure(400, 'REQUISICAO_INVALIDA') }; }
  const file = form.get('file'); const format = form.get('format');
  if (!(file instanceof File) || (format !== 'CSV' && format !== 'CNAB') || !file.size) return { error: failure(422, 'ARQUIVO_INVALIDO') };
  if (file.size > maxImportBytes) return { error: failure(413, 'ARQUIVO_GRANDE', text.tooLarge) };
  const contents = await file.text(); const invalid = contents === sampleContents(format, true);
  const items = [0, 1].map(index => ({ ...inputOf(receivableFixture), assignorName: receivableFixture.assignorName,
    externalReference: `${format}-000${index + 1}`, faceValueBrl: index ? '2000.00' : '1000.00', dueDate: '2099-12-31',
    type: index ? 'CHEQUE_PRE_DATADO' as const : 'DUPLICATA_MERCANTIL' as const,
    paymentCurrency: format === 'CSV' && index ? 'USD' as const : 'BRL' as const,
    itemIndex: index, line: format === 'CSV' ? index + 2 : index * 2 + 3 }));
  if (invalid || contents !== sampleContents(format)) return { error: HttpResponse.json({ code: 'ARQUIVO_INVALIDO', message: invalid ? text.demoInvalid : text.demoUnsupported,
    details: invalid ? [{ code: 'REFERENCIA_INVALIDA', field: 'externalReference', line: format === 'CSV' ? 3 : 5, itemIndex: 1, message: text.demoField }] : [{ code: 'DEMO_ARQUIVO_DESCONHECIDO', message: text.demoUnsupported }],
    preview: { source: format, items: invalid ? items.slice(0, 1) : [] } }, { status: 422 }) };
  const overrides = form.get('paymentCurrencies');
  if (overrides !== null) {
    if (format !== 'CNAB' || previewOnly) return { error: failure(422, 'MOEDAS_INVALIDAS') };
    try {
      const parsed = currenciesSchema.safeParse(JSON.parse(typeof overrides === 'string' ? overrides : await overrides.text()));
      if (!parsed.success || new Set(parsed.data.map(row => row.itemIndex)).size !== parsed.data.length || parsed.data.some(row => row.itemIndex >= items.length)) return { error: failure(422, 'MOEDAS_INVALIDAS') };
      parsed.data.forEach(row => { items[row.itemIndex]!.paymentCurrency = row.paymentCurrency; });
    } catch { return { error: failure(422, 'MOEDAS_INVALIDAS') }; }
  }
  return { preview: { source: format, items, itemCount: items.length, faceValueBrl: '3000.00' } };
}
