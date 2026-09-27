import { http, HttpResponse } from 'msw';
import { authorize, failure } from '../../common/testing/demo';
import { createBatchStore, type Scenario } from '../../batch/mocks/handlers';
import { createExchangeStore, currentQuote } from '../../exchange/mocks/handlers';
import { filterStatement, type LedgerItem } from '../../settlement/mocks/statementHandlers';
import { addDays, financialDate, financialDayStart, lastSevenDays } from '../../common/format/financialCalendar';
import { dashboardSchema, period, type Dashboard } from '../services/contracts';
const cents = (value: string) => BigInt(value.replace('.', ''));
const decimal = (value: bigint) => `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;
export function aggregateDashboard(kind: Dashboard['period']['kind'], batches: Scenario[], exchange: ReturnType<typeof createExchangeStore>, ledger: LedgerItem[], now = Date.now()) {
  const today = financialDate(now); const range = kind === 'LAST_7_DAYS' ? lastSevenDays(now) : { from: `${today.slice(0, 7)}-01`, to: addDays(today, 1) };
  const start = financialDayStart(range.from); const end = financialDayStart(range.to); const rows = filterStatement(ledger, { start, end });
  const sum = (values: string[]) => decimal(values.reduce((total, value) => total + cents(value), 0n));
  const faceValueBrl = sum(rows.map(row => row.faceValueBrl)); const presentValueBrl = sum(rows.map(row => row.presentValueBrl));
  const totals = { faceValueBrl, presentValueBrl, discountBrl: decimal(cents(faceValueBrl) - cents(presentValueBrl)),
    paymentBrl: sum(rows.filter(row => row.paymentCurrency === 'BRL').map(row => row.paymentValue)), paymentUsd: sum(rows.filter(row => row.paymentCurrency === 'USD').map(row => row.paymentValue)) };
  const dailyPayments: Dashboard['dailyPayments'] = [];
  for (let date = range.from; date < range.to; date = addDays(date, 1)) {
    const day = rows.filter(row => financialDate(new Date(row.settledAt)) === date);
    dailyPayments.push({ date, paymentBrl: sum(day.filter(row => row.paymentCurrency === 'BRL').map(row => row.paymentValue)), paymentUsd: sum(day.filter(row => row.paymentCurrency === 'USD').map(row => row.paymentValue)) });
  }
  const batchCounts = { READY: 0, PENDING: 0, SETTLED: 0, FAILED: 0 }; batches.forEach(row => { batchCounts[row.batch.status]++; });
  const quote = currentQuote(exchange.quotes, now);
  return dashboardSchema.parse({ generatedAt: new Date(now).toISOString(), period: { kind, start, end, timeZone: 'America/Sao_Paulo' }, totals, dailyPayments, batchCounts,
    pendingExchangeProposals: exchange.proposals.filter(row => row.status === 'PENDING').length, exchange: { current: quote.current, status: quote.currentStatus } });
}
export function createDashboardHandlers(batches = createBatchStore(), exchange = createExchangeStore(), ledger: LedgerItem[] = []) {
  return [http.get('/api/dashboard', ({ request }) => {
    const denied = authorize(request); if (denied) return denied;
    const parsed = period.safeParse(new URL(request.url).searchParams.get('period') ?? 'LAST_7_DAYS');
    return parsed.success ? HttpResponse.json(aggregateDashboard(parsed.data, batches, exchange, ledger)) : failure(400, 'REQUISICAO_INVALIDA');
  })];
}
export const dashboardHandlers = createDashboardHandlers();
