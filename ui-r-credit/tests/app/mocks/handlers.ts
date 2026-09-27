import type { LedgerItem } from '../../settlement/mocks/statementHandlers';
import { http } from 'msw';
import { createRegisterHandlers, createRegisterStore } from '../../register/mocks/handlers';
import { createBatchHandlers, createBatchStore } from '../../batch/mocks/handlers';
import { createExchangeHandlers, createExchangeStore, currentQuote } from '../../exchange/mocks/handlers';
import { createPricingHandlers } from '../../pricing/mocks/handlers';
import { createSettlementHandlers } from '../../settlement/mocks/handlers';
import { createDashboardHandlers } from '../../dashboard/mocks/handlers';
import { authorize, failure, demoText } from '../../common/testing/demo';
export function createDemoHandlers() {
  const ledger: LedgerItem[] = [];
  const exchange = createExchangeStore(); const quote = () => currentQuote(exchange.quotes, Date.now()).current;
  const register = createRegisterStore(); const batches = createBatchStore();
  return [...createRegisterHandlers(register), ...createSettlementHandlers(batches, 'SETTLED', quote, ledger), ...createBatchHandlers(undefined, id => register.rows.find(row => row.uuid === id), batches), ...createExchangeHandlers(exchange), ...createPricingHandlers(batches, quote), ...createDashboardHandlers(batches, exchange, ledger),
    http.all('/api/*', ({ request }) => authorize(request) ?? failure(404, 'ROTA_INEXISTENTE', demoText.missing))];
}
