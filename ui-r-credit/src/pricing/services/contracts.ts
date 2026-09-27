import { z } from 'zod';
import { uuid, instant, date, rate, totals, count, term, money, currency } from '../../common/http/contracts';
import { quoteSchema } from '../../exchange/services/contracts';
import { createBatchSchema } from '../../batch/services/contracts';
export const simulationInputSchema = z.union([z.strictObject({ batchUuid: uuid }), createBatchSchema]);
export const simulationSchema = z.object({ calculatedAt: instant, calculationDate: date, indicative: z.literal(true), calculationVersion: z.string(), baseRate: rate, exchangeRate: quoteSchema.nullable(), totals, items: z.array(z.object({ itemIndex: count, receivableUuid: uuid.optional(), days: count, spread: rate, termMonths: term, presentValueBrl: money, discountBrl: money, paymentCurrency: currency, paymentValue: money })).min(1).max(1000).refine(items => items.every((item, index) => item.itemIndex === index)) });
export type Simulation = z.infer<typeof simulationSchema>;
