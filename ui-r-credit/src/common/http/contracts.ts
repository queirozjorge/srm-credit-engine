import { z } from 'zod';
import { isCivilDate } from '../format/dates';
export const uuid = z.uuid();
export const instant = z.iso.datetime();
export const date = z.string().refine(isCivilDate);
export const version = z.string().regex(/^(0|[1-9]\d{0,18})$/);
export const money = z.string().regex(/^-?(0|[1-9]\d{0,16})\.\d{2}$/);
export const rate = z.string().regex(/^(0|[1-9]\d{0,11})(\.\d{1,12})?$/);
export const signedRate = z.string().regex(/^-?(0|[1-9]\d{0,11})(\.\d{1,12})?$/);
export const term = z.string().regex(/^\d+(\.\d+)?$/);
export const count = z.number().int().nonnegative().safe();
export const currency = z.enum(['BRL', 'USD']);
export const actor = z.object({ issuer: z.string().min(1), subject: z.string().min(1), displayName: z.string().trim().min(1).nullable().optional() });
export const created = z.object({ uuid });
export const totals = z.object({ faceValueBrl: money, presentValueBrl: money, discountBrl: money, paymentBrl: money, paymentUsd: money });
export function pageOf<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item), page: z.number().int().positive().safe(), size: z.number().int().min(1).max(100), totalItems: count, totalPages: count })
    .refine(p => p.totalPages === Math.ceil(p.totalItems / p.size) && p.items.length <= p.size &&
      (p.page <= p.totalPages || p.items.length === 0));
}
export const fieldIssue = z.object({ code: z.string(), message: z.string(), field: z.string().optional(), itemIndex: count.optional(), line: z.number().int().positive().optional() });
export const apiErrorSchema = z.object({ code: z.string(), message: z.string().min(1), details: z.array(fieldIssue).optional(),
  context: z.object({ batchUuid: uuid.optional(), requestUuid: uuid.optional(), statusUrl: z.string().regex(/^\/api\/settlement-requests\/[0-9a-f-]+$/i).optional() }).optional() });
