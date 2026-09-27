import { z } from 'zod';
import { uuid, instant, date, actor, rate, term, count, totals, money, currency, pageOf } from '../../common/http/contracts';
import { quoteSchema } from '../../exchange/services/contracts';
import { receivableSchema } from '../../batch/services/receivableContracts';
export const snapshotSchema = z.object({ calculationDate: date, calculationVersion: z.string(), dayCountConvention: z.literal('ACTUAL_30'), baseRate: rate, exchangeRate: quoteSchema.nullable() });
export const resultSchema = z.object({ uuid, settledAt: instant, totals });
const base = { uuid, batchUuid: uuid, statusUrl: z.string().regex(/^\/api\/settlement-requests\/[0-9a-f-]+$/i), acceptedAt: instant, requestedBy: actor, snapshot: snapshotSchema };
export const requestSchema = z.discriminatedUnion('status', [
  z.object({ ...base, status: z.literal('PENDING'), completedAt: z.null(), result: z.null(), failure: z.null() }),
  z.object({ ...base, status: z.literal('SETTLED'), completedAt: instant, result: resultSchema, failure: z.null() }),
  z.object({ ...base, status: z.literal('FAILED'), completedAt: instant, result: z.null(), failure: z.object({ code: z.string(), message: z.string() }) }),
]).refine(r => r.statusUrl === `/api/settlement-requests/${r.uuid}`);
export const requestItemSchema = z.object({ receivable: receivableSchema, terms: z.object({ days: count, termMonths: term, spread: rate }), result: z.object({ presentValueBrl: money, discountBrl: money, paymentCurrency: currency, paymentValue: money }).nullable() });
export const statementItemSchema = z.object({ uuid, batchUuid: uuid, requestUuid: uuid, settledAt: instant, receivableUuid: uuid, assignorUuid: uuid, assignorName: z.string(), externalReference: z.string(), paymentCurrency: currency, faceValueBrl: money, presentValueBrl: money, paymentValue: money });
export const statementPageSchema = pageOf(statementItemSchema);
export type SettlementRequest = z.infer<typeof requestSchema>;
