import { z } from 'zod';
import { uuid, count, term, rate, money, currency, pageOf } from '../../common/http/contracts';
import { receivableSchema } from '../../batch/services/receivableContracts';
import { auditEventSchema, itemFailureSchema, settlementResultSchema } from './baseContracts';

export { acceptedSnapshotSchema as snapshotSchema, auditEventSchema, itemCountsSchema, itemFailureSchema, settlementRequestSchema as requestSchema, settlementResultSchema as resultSchema } from './baseContracts';
export type { AuditEvent, ItemCounts, ItemFailure, SettlementRequest, SettlementResult } from './baseContracts';

export const requestItemSchema = z.object({
  uuid,
  requestUuid: uuid,
  receivable: receivableSchema,
  attemptNumber: count.min(1),
  previousAttemptUuid: uuid.nullable(),
  status: z.enum(['PENDING', 'SETTLED', 'FAILED']),
  hasError: z.boolean(),
  retryCount: count.max(3),
  nextRetryAt: z.iso.datetime().nullable(),
  terms: z.object({ days: count, termMonths: term, spread: rate }).nullable(),
  completedAt: z.iso.datetime().nullable(),
  failure: itemFailureSchema.nullable(),
  result: settlementResultSchema.nullable(),
}).refine(item => item.hasError === (item.status === 'FAILED'))
  .refine(item => item.status === 'PENDING' ? item.completedAt === null && item.failure === null && item.result === null
    : item.completedAt !== null && (item.status === 'SETTLED' ? item.failure === null && item.result !== null : item.failure !== null && item.result === null))
  .refine(item => item.terms !== null || (item.status === 'FAILED' && item.failure?.stage === 'ACCEPTANCE'))
  .refine(item => item.status !== 'PENDING' || item.nextRetryAt === null || item.retryCount < 3)
  .refine(item => item.status === 'PENDING' || item.nextRetryAt === null)
  .refine(item => item.result === null || item.result.paymentCurrency === item.receivable.paymentCurrency)
  .refine(item => item.previousAttemptUuid !== item.uuid);
export type SettlementRequestItem = z.infer<typeof requestItemSchema>;

export const statementItemSchema = z.object({ uuid, batchUuid: uuid, requestUuid: uuid, settledAt: z.iso.datetime(), receivableUuid: uuid, assignorUuid: uuid, assignorName: z.string(), externalReference: z.string(), paymentCurrency: currency, faceValueBrl: money, presentValueBrl: money, paymentValue: money });
export const statementPageSchema = pageOf(statementItemSchema);
export const requestItemPageSchema = pageOf(requestItemSchema);
export const auditEventPageSchema = pageOf(auditEventSchema);
