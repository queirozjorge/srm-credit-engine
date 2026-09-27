import { http } from 'msw';
import { z } from 'zod';
import { authorize, failure, paginated } from '../../common/testing/demo';
import { currency, instant, uuid } from '../../common/http/contracts';
import { statementItemSchema } from '../services/contracts';
export type LedgerItem = z.infer<typeof statementItemSchema> & { settlementUuid?: string };
const filtersSchema = z.object({ start: instant.optional(), end: instant.optional(), assignorUuid: uuid.optional(), paymentCurrency: currency.optional() })
  .refine(value => !value.start || !value.end || Date.parse(value.start) < Date.parse(value.end));
export function filterStatement(rows: LedgerItem[], filters: z.infer<typeof filtersSchema>) {
  return rows.filter(row => (!filters.start || Date.parse(row.settledAt) >= Date.parse(filters.start)) && (!filters.end || Date.parse(row.settledAt) < Date.parse(filters.end))
    && (!filters.assignorUuid || row.assignorUuid === filters.assignorUuid) && (!filters.paymentCurrency || row.paymentCurrency === filters.paymentCurrency))
    .sort((a, b) => b.settledAt.localeCompare(a.settledAt) || (b.settlementUuid ?? b.requestUuid).localeCompare(a.settlementUuid ?? a.requestUuid) || b.uuid.localeCompare(a.uuid));
}
export function createStatementHandlers(rows: LedgerItem[] = []) {
  return [http.get('/api/settlements/items', ({ request }) => {
    const denied = authorize(request); if (denied) return denied;
    const parsed = filtersSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return failure(400, 'FILTROS_INVALIDOS');
    return paginated(request, filterStatement(rows, parsed.data).map(row => statementItemSchema.parse(row)));
  })];
}
