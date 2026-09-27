import { quoteFixture } from '../../exchange/mocks/fixtures';
import type { quoteSchema } from '../../exchange/services/contracts';
import type { z } from 'zod';
import { http, HttpResponse } from 'msw';
import { authorize, failure, readBody } from '../../common/testing/demo';
import { createBatchStore, type Scenario } from '../../batch/mocks/handlers';
import { simulationInputSchema } from '../services/contracts';
import type { ReceivableInput } from '../../batch/services/receivableContracts';
import { simulationFixture } from './fixtures';
type BatchSimulationInput = { batchUuid: string; receivableUuids?: string[] };
function isBatchSimulationInput(input: z.infer<typeof simulationInputSchema>): input is BatchSimulationInput {
  return 'batchUuid' in input;
}
// Cenário financeiro fixo; o motor de precificação permanece no backend.
export function supportedSimulation(items: ReceivableInput[]) {
  return items.length >= 1 && items.length <= 1000 && items.every(item => item.faceValueBrl === '1000.00' && item.dueDate === '2026-09-26'
    && item.paymentCurrency === 'BRL' && item.type === 'DUPLICATA_MERCANTIL');
}
const cents = (value: string) => BigInt(value.replace('.', ''));
function decimal(value: bigint) {
  const sign = value < 0n ? '-' : ''; const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}
function multiplyMoney(value: string, count: number) { return decimal(cents(value) * BigInt(count)); }
export function createPricingHandlers(batches: Scenario[] = createBatchStore(), quote: () => z.infer<typeof quoteSchema> | null = () => quoteFixture) {
  return [http.post('/api/simulations', async ({ request }) => {
    const denied = authorize(request, 'simulate'); if (denied) return denied;
    const parsed = await readBody(request, simulationInputSchema); if (!parsed.success) return failure(400, 'REQUISICAO_INVALIDA');
    const input = parsed.data;
    let items: ReceivableInput[]; let receivableUuids: string[] | undefined;
    if (isBatchSimulationInput(input)) {
      const batch = batches.find(row => row.batch.uuid === input.batchUuid);
      if (!batch) return failure(422, 'DADOS_INVALIDOS');
      const ids = input.receivableUuids;
      const selected = (ids ? ids.map(id => batch.items.find(item => item.uuid === id)).filter((item): item is Scenario['items'][number] => item !== undefined) : [...batch.items])
        .sort((a, b) => a.uuid.localeCompare(b.uuid));
      if (ids && selected.length !== ids.length) return failure(422, 'DADOS_INVALIDOS');
      items = selected; receivableUuids = selected.map(item => item.uuid);
    } else items = (input as { items: ReceivableInput[] }).items;
    if (!supportedSimulation(items)) return failure(422, 'DADOS_INVALIDOS');
    const template = simulationFixture.items[0]!;
    const totals = Object.fromEntries(Object.entries(simulationFixture.totals).map(([key, value]) => [key, multiplyMoney(value, items.length)])) as typeof simulationFixture.totals;
    return HttpResponse.json({ ...simulationFixture, exchangeRate: quote(), totals, items: items.map((_, index) => ({ ...template,
      itemIndex: index, receivableUuid: receivableUuids?.[index] })) });
  })];
}
export const pricingHandlers = createPricingHandlers();
