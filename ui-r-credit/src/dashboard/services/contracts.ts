import { addDays, financialDate, financialDayStart } from '../../common/format/financialCalendar';
import { z } from 'zod';
import { instant, date, totals, money, count } from '../../common/http/contracts';
import { quoteSchema } from '../../exchange/services/contracts';
export const period = z.enum(['LAST_7_DAYS', 'CURRENT_MONTH']);
export const dashboardSchema = z.object({ generatedAt: instant, period: z.object({ kind: period, start: instant, end: instant, timeZone: z.literal('America/Sao_Paulo') }), totals, dailyPayments: z.array(z.object({ date, paymentBrl: money, paymentUsd: money })).min(1).max(31), batchCounts: z.object({ READY: count, PENDING: count, SETTLED: count, FAILED: count }), pendingExchangeProposals: count, exchange: z.object({ current: quoteSchema.nullable(), status: z.enum(['VALID', 'EXPIRED', 'ABSENT']) }) }).refine(data => {
  const start = financialDate(new Date(data.period.start)); const end = financialDate(new Date(data.period.end));
  if (Date.parse(data.period.start) !== Date.parse(financialDayStart(start)) || Date.parse(data.period.end) !== Date.parse(financialDayStart(end)) || start >= end) return false;
  const rows = data.dailyPayments;
  return rows.every((row, index) => row.date === addDays(start, index) && !row.paymentBrl.startsWith('-') && !row.paymentUsd.startsWith('-'))
    && addDays(start, rows.length) === end && (data.period.kind !== 'LAST_7_DAYS' || rows.length === 7);
});
export type Dashboard = z.infer<typeof dashboardSchema>;
