import { z } from 'zod';
import { uuid, money, date, currency, count } from '../../common/http/contracts';
export const receivableInputSchema = z.strictObject({ assignorUuid: uuid, externalReference: z.string().min(1), type: z.enum(['DUPLICATA_MERCANTIL', 'CHEQUE_PRE_DATADO']), faceValueBrl: money.refine(v => !v.startsWith('-') && /[1-9]/.test(v)), dueDate: date, paymentCurrency: currency });
export const receivableSchema = receivableInputSchema.extend({ uuid, assignorName: z.string() });
export const previewItemSchema = receivableInputSchema.extend({ itemIndex: count, line: z.number().int().positive(), assignorName: z.string() });
export type ReceivableInput = z.infer<typeof receivableInputSchema>;
