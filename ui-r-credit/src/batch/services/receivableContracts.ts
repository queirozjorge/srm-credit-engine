import { z } from 'zod';
import { uuid, money, date, currency, count } from '../../common/http/contracts';
import { itemFailureSchema, processingStatus } from '../../settlement/services/baseContracts';
export const receivableInputSchema = z.strictObject({ assignorUuid: uuid, externalReference: z.string().min(1), type: z.enum(['DUPLICATA_MERCANTIL', 'CHEQUE_PRE_DATADO']), faceValueBrl: money.refine(v => !v.startsWith('-') && /[1-9]/.test(v)), dueDate: date, paymentCurrency: currency });
export const receivableProcessingSchema = z.object({
  status: processingStatus,
  hasError: z.boolean(),
  failure: itemFailureSchema.nullable(),
  activeRequestUuid: uuid.nullable(),
  attemptNumber: count,
  settlementUuid: uuid.nullable(),
}).refine(state => state.hasError === (state.status === 'FAILED'))
  .refine(state => state.status === 'READY'
    ? state.activeRequestUuid === null && state.attemptNumber === 0 && state.settlementUuid === null && state.failure === null
    : state.activeRequestUuid !== null && state.attemptNumber > 0)
  .refine(state => state.status === 'SETTLED'
    ? state.settlementUuid !== null && state.failure === null
    : state.settlementUuid === null)
  .refine(state => state.status !== 'FAILED' || state.failure !== null)
  .refine(state => state.status === 'FAILED' || state.failure === null);
export const receivableSchema = receivableInputSchema.extend({ uuid, assignorName: z.string(), processing: receivableProcessingSchema });
export const previewItemSchema = receivableInputSchema.extend({ itemIndex: count, line: z.number().int().positive(), assignorName: z.string() });
export type ReceivableInput = z.infer<typeof receivableInputSchema>;
export type ReceivableProcessing = z.infer<typeof receivableProcessingSchema>;
export type Receivable = z.infer<typeof receivableSchema>;
