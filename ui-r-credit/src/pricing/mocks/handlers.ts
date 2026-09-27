import { quoteFixture } from '../../exchange/mocks/fixtures';
import type { quoteSchema } from '../../exchange/services/contracts';
import type { z } from 'zod';
import { http, HttpResponse } from 'msw';
import { authorize, failure, readBody } from '../../common/testing/demo';
import { createBatchStore, type Scenario } from '../../batch/mocks/handlers';
import { simulationInputSchema } from '../services/contracts';
import type { ReceivableInput } from '../../batch/services/receivableContracts';
import { simulationFixture } from './fixtures';
// Cenário financeiro fixo; o motor de precificação permanece no backend.
export function supportedSimulation(items: ReceivableInput[]) {
  return items.length === 1 && items[0]!.faceValueBrl === '1000.00' && items[0]!.dueDate === '2026-09-26'
    && items[0]!.paymentCurrency === 'BRL' && items[0]!.type === 'DUPLICATA_MERCANTIL';
}
export function createPricingHandlers(batches: Scenario[] = createBatchStore(), quote: () => z.infer<typeof quoteSchema> | null = () => quoteFixture) {
  return [http.post('/api/simulations', async ({ request }) => {
    const denied = authorize(request, 'simulate'); if (denied) return denied;
    const parsed = await readBody(request, simulationInputSchema); if (!parsed.success) return failure(400, 'REQUISICAO_INVALIDA');
    const batchUuid = 'batchUuid' in parsed.data ? parsed.data.batchUuid : null;
    const batch = batches.find(row => row.batch.uuid === batchUuid);
    const items = 'items' in parsed.data ? parsed.data.items : batch?.items;
    if (!items || !supportedSimulation(items)) return failure(422, 'DADOS_INVALIDOS');
    return HttpResponse.json({ ...simulationFixture, exchangeRate: quote(), items: simulationFixture.items.map(item => ({ ...item, receivableUuid: batch?.items[0]?.uuid })) });
  })];
}
export const pricingHandlers = createPricingHandlers();
