import { z } from 'zod';
import { uuid, instant, date, signedRate, actor, rate, money, count, version, totals } from '../../common/http/contracts';
import { quoteSchema } from '../../exchange/services/contracts';

export const batchStatus = z.enum(['READY', 'PENDING', 'SETTLED', 'PARTIALLY_SETTLED', 'FAILED']);
export const processingStatus = z.enum(['READY', 'PENDING', 'SETTLED', 'FAILED']);
export const requestStatus = z.enum(['PENDING', 'SETTLED', 'PARTIALLY_SETTLED', 'FAILED']);
export const requestKind = z.enum(['INITIAL', 'REPROCESS']);

export const itemCountsSchema = z.object({ ready: count, pending: count, settled: count, failed: count });
export type ItemCounts = z.infer<typeof itemCountsSchema>;
export const settlementTotalsSchema = totals.refine(values =>
  !values.faceValueBrl.startsWith('-') && !values.presentValueBrl.startsWith('-')
    && !values.paymentBrl.startsWith('-') && !values.paymentUsd.startsWith('-'));

export const itemFailureSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  stage: z.enum(['ACCEPTANCE', 'PROCESSING']),
  occurredAt: instant,
});
export type ItemFailure = z.infer<typeof itemFailureSchema>;

export const acceptedSnapshotSchema = z.object({
  calculationDate: date,
  calculationVersion: z.string().min(1),
  dayCountConvention: z.literal('ACTUAL_30'),
  baseRate: signedRate,
  exchangeRate: quoteSchema.nullable(),
});

export const settlementResultSchema = z.object({
  uuid,
  settledAt: instant,
  presentValueBrl: money,
  discountBrl: money,
  paymentCurrency: z.enum(['BRL', 'USD']),
  paymentValue: money,
}).refine(result => !result.presentValueBrl.startsWith('-') && !result.paymentValue.startsWith('-'));
export type SettlementResult = z.infer<typeof settlementResultSchema>;

const requestBase = {
  uuid,
  batchUuid: uuid,
  kind: requestKind,
  reason: z.string().min(1).max(500).nullable(),
  statusUrl: z.string().regex(/^\/api\/settlement-requests\/[0-9a-f-]+$/i),
  acceptedAt: instant,
  requestedBy: actor,
  snapshot: acceptedSnapshotSchema,
  counts: itemCountsSchema,
  settledTotals: settlementTotalsSchema,
};

const requestPendingSchema = z.object({ ...requestBase, status: z.literal('PENDING'), completedAt: z.null() });
const requestTerminalFields = { ...requestBase, completedAt: instant };
const requestSettledSchema = z.object({ ...requestTerminalFields, status: z.literal('SETTLED') });
const requestPartialSchema = z.object({ ...requestTerminalFields, status: z.literal('PARTIALLY_SETTLED') });
const requestFailedSchema = z.object({ ...requestTerminalFields, status: z.literal('FAILED') });

export const settlementRequestSchema = z.discriminatedUnion('status', [requestPendingSchema, requestSettledSchema, requestPartialSchema, requestFailedSchema])
  .refine(request => request.statusUrl === `/api/settlement-requests/${request.uuid}`)
  .refine(request => {
    const { ready, pending, settled, failed } = request.counts;
    if (ready !== 0 || ready + pending + settled + failed === 0) return false;
    if (request.kind === 'INITIAL' && request.reason !== null) return false;
    if (request.kind === 'REPROCESS' && (request.reason === null || request.reason.trim().length === 0)) return false;
    if (request.status === 'PENDING') return pending > 0;
    if (pending !== 0) return false;
    if (request.status === 'SETTLED') return settled > 0 && failed === 0;
    if (request.status === 'PARTIALLY_SETTLED') return settled > 0 && failed > 0;
    return failed > 0 && settled === 0;
  });
export type SettlementRequest = z.infer<typeof settlementRequestSchema>;

const auditBase = { uuid, batchUuid: uuid, receivableUuid: uuid.nullable(), requestUuid: uuid.nullable(), attemptUuid: uuid.nullable(), actor, registeredAt: instant, correlationId: z.string().min(1) };
const auditFailure = itemFailureSchema;
const auditEventVariants = [
  z.object({ ...auditBase, eventType: z.literal('BATCH_CREATED'), receivableUuid: z.null(), requestUuid: z.null(), attemptUuid: z.null(), details: z.object({ source: z.enum(['FORM', 'CSV', 'CNAB']), itemCount: count.min(1).max(1000) }) }),
  z.object({ ...auditBase, eventType: z.literal('SETTLEMENT_REQUESTED'), receivableUuid: z.null(), requestUuid: uuid, attemptUuid: z.null(), details: z.object({ receivableUuids: z.array(uuid).min(1).max(1000) }) }),
  z.object({ ...auditBase, eventType: z.literal('SETTLEMENT_REPROCESS_REQUESTED'), receivableUuid: z.null(), requestUuid: uuid, attemptUuid: z.null(), details: z.object({ receivableUuids: z.array(uuid).min(1).max(1000), reason: z.string().trim().min(1).max(500) }) }),
  z.object({ ...auditBase, eventType: z.literal('RECEIVABLE_ATTEMPT_ACCEPTED'), receivableUuid: uuid, requestUuid: uuid, attemptUuid: uuid, details: z.object({ attemptNumber: count.min(1), previousAttemptUuid: uuid.nullable(), termDays: count.nullable(), spread: rate.nullable() }) }),
  z.object({ ...auditBase, eventType: z.literal('RECEIVABLE_ATTEMPT_REJECTED'), receivableUuid: uuid, requestUuid: uuid, attemptUuid: uuid, details: z.object({ failure: auditFailure }) }),
  z.object({ ...auditBase, eventType: z.literal('RECEIVABLE_PROCESSING_RETRY_SCHEDULED'), receivableUuid: uuid, requestUuid: uuid, attemptUuid: uuid, details: z.object({ retryNumber: count.min(1).max(3), nextRetryAt: instant, cause: z.object({ code: z.string().min(1), message: z.string().min(1) }) }) }),
  z.object({ ...auditBase, eventType: z.literal('RECEIVABLE_PROCESSING_ATTEMPT_FAILED'), receivableUuid: uuid, requestUuid: uuid, attemptUuid: uuid, details: z.object({ retryNumber: count.max(3), failure: auditFailure }) }),
  z.object({ ...auditBase, eventType: z.literal('RECEIVABLE_SETTLED'), receivableUuid: uuid, requestUuid: uuid, attemptUuid: uuid, details: z.object({ settlementUuid: uuid }) }),
  z.object({ ...auditBase, eventType: z.literal('RECEIVABLE_SETTLEMENT_FAILED'), receivableUuid: uuid, requestUuid: uuid, attemptUuid: uuid, details: z.object({ retryCount: count.max(3), failure: auditFailure }) }),
] as const;
export const auditEventSchema = z.discriminatedUnion('eventType', auditEventVariants);
export type AuditEvent = z.infer<typeof auditEventSchema>;

export const batchStatusSchema = batchStatus;
export const batchProgressVersionSchema = version;
