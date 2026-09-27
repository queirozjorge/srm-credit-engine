import { isCivilDate } from '../../common/format/dates';
import { financialDayStart, lastSevenDays } from '../../common/format/financialCalendar';
import { uuid } from '../../common/http/contracts';
export interface StatementFilters { from: string; to: string; assignorUuid: string; paymentCurrency: string }
export function statementFilters(params: URLSearchParams, defaults = lastSevenDays()) {
  const raw = params.get('page') ?? '1'; const page = Number(raw);
  return { from: params.has('from') ? params.get('from')! : defaults.from, to: params.has('to') ? params.get('to')! : defaults.to,
    assignorUuid: params.get('assignorUuid') ?? '', paymentCurrency: params.get('paymentCurrency') ?? '',
    page: /^\d+$/.test(raw) && Number.isSafeInteger(page) && page > 0 ? page : 1,
    size: [20, 50, 100].includes(Number(params.get('size'))) ? Number(params.get('size')) : 20 };
}
export function statementErrors(filters: StatementFilters) {
  return { from: Boolean(filters.from && (!isCivilDate(filters.from) || filters.from.startsWith('0000'))),
    to: Boolean(filters.to && (!isCivilDate(filters.to) || filters.to.startsWith('0000'))),
    range: Boolean(filters.from && filters.to && filters.from >= filters.to),
    assignor: Boolean(filters.assignorUuid && !uuid.safeParse(filters.assignorUuid).success),
    currency: !['', 'BRL', 'USD'].includes(filters.paymentCurrency) };
}
export function statementQuery(filters: ReturnType<typeof statementFilters>) {
  if (Object.values(statementErrors(filters)).some(Boolean)) return null;
  return { start: filters.from ? financialDayStart(filters.from) : undefined, end: filters.to ? financialDayStart(filters.to) : undefined,
    assignorUuid: filters.assignorUuid || undefined, paymentCurrency: filters.paymentCurrency || undefined, page: filters.page, size: filters.size };
}
