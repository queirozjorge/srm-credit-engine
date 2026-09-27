import { z } from 'zod';
import { uuid, count, money, instant, actor, pageOf, apiErrorSchema, fieldIssue } from '../../common/http/contracts';
import { batchStatusSchema, itemCountsSchema, settlementRequestSchema, settlementTotalsSchema } from '../../settlement/services/baseContracts';
import { receivableInputSchema, previewItemSchema } from './receivableContracts';
export const batchStatus = batchStatusSchema;
export { itemCountsSchema };
export const batchSummarySchema = z.object({ uuid, source: z.enum(['FORM', 'CSV', 'CNAB']), status: batchStatus, itemCount: count.min(1).max(1000), assignorCount: count, soleAssignor: z.object({ uuid, name: z.string() }).nullable(), representativeExternalReference: z.string().min(1), faceValueBrl: money, registeredAt: instant, counts: itemCountsSchema })
  .refine(batch => batch.counts.ready + batch.counts.pending + batch.counts.settled + batch.counts.failed === batch.itemCount)
  .refine(batch => batch.status === 'READY' ? batch.counts.ready === batch.itemCount
    : batch.status === 'PENDING' ? batch.counts.ready === 0 && batch.counts.pending > 0
      : batch.status === 'SETTLED' ? batch.counts.settled === batch.itemCount
        : batch.status === 'PARTIALLY_SETTLED' ? batch.counts.ready === 0 && batch.counts.pending === 0 && batch.counts.settled > 0 && batch.counts.failed > 0
          : batch.counts.ready === 0 && batch.counts.pending === 0 && batch.counts.settled === 0 && batch.counts.failed === batch.itemCount);
export const batchDetailSchema = batchSummarySchema.extend({ createdBy: actor, activeRequest: settlementRequestSchema.nullable(), settledTotals: settlementTotalsSchema, progressVersion: z.string().regex(/^(0|[1-9]\d{0,18})$/) })
  .refine(batch => batch.status === 'READY' ? batch.counts.ready === batch.itemCount && batch.activeRequest === null
    : batch.status === 'PENDING' ? batch.counts.pending > 0 && batch.activeRequest?.status === 'PENDING'
      : batch.status === 'SETTLED' ? batch.counts.settled === batch.itemCount && batch.activeRequest !== null
        : batch.status === 'PARTIALLY_SETTLED' ? batch.counts.pending === 0 && batch.counts.ready === 0 && batch.counts.settled > 0 && batch.counts.failed > 0 && batch.activeRequest !== null
          : batch.counts.pending === 0 && batch.counts.ready === 0 && batch.counts.settled === 0 && batch.counts.failed === batch.itemCount && batch.activeRequest !== null);
export const batchPageSchema = pageOf(batchSummarySchema);
export const createBatchSchema = z.strictObject({ items: z.array(receivableInputSchema).min(1).max(1000) });
export const batchCreatedSchema = z.object({ uuid, status: z.literal('READY') });
export const previewSchema = z.object({ source: z.enum(['CSV', 'CNAB']), itemCount: count.max(1000), faceValueBrl: money, items: z.array(previewItemSchema).max(1000) });
export const invalidPreviewSchema = apiErrorSchema.extend({ code: z.literal('ARQUIVO_INVALIDO'), details: z.array(fieldIssue).max(1000), detailsTruncated: z.boolean().optional(), preview: z.object({ source: z.enum(['CSV', 'CNAB']), items: z.array(previewItemSchema).max(1000) }) });
export type BatchDetail = z.infer<typeof batchDetailSchema>;
export type BatchSummary = z.infer<typeof batchSummarySchema>;
