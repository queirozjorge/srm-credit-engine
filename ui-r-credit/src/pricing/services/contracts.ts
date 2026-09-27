import { z } from 'zod';
import { uuid, instant, date, signedRate, rate, totals, count, term, money, currency } from '../../common/http/contracts';
import { quoteSchema } from '../../exchange/services/contracts';
import { createBatchSchema } from '../../batch/services/contracts';
export const simulationInputSchema = z.union([
  z.strictObject({ batchUuid: uuid, receivableUuids: z.array(uuid).min(1).max(1000).optional() } )
    .refine(input => input.receivableUuids === undefined || new Set(input.receivableUuids).size === input.receivableUuids.length),
  createBatchSchema,
]);
export const simulationSchema = z.object({ calculatedAt: instant, calculationDate: date, indicative: z.literal(true), calculationVersion: z.string(), baseRate: signedRate, exchangeRate: quoteSchema.nullable(), totals, items: z.array(z.object({ itemIndex: count, receivableUuid: uuid.optional(), days: count, spread: rate, termMonths: term, presentValueBrl: money, discountBrl: money, paymentCurrency: currency, paymentValue: money })).min(1).max(1000).refine(items => items.every((item, index) => item.itemIndex === index)) });
export type Simulation = z.infer<typeof simulationSchema>;
