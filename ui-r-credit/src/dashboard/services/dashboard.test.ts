import { expect, test } from 'vitest';
import { chartScale } from './chart';
import { dashboardSchema } from './contracts';
import { dashboardFixture } from '../mocks/fixtures';
import { aggregateDashboard } from '../mocks/handlers';
import { createBatchStore } from '../../batch/mocks/handlers';
import { createExchangeStore } from '../../exchange/mocks/handlers';
import { demoUuid } from '../../common/testing/demo';
const item = { uuid: demoUuid(20), batchUuid: demoUuid(2), requestUuid: demoUuid(7), settledAt: '2026-09-26T03:00:00Z', receivableUuid: demoUuid(3), assignorUuid: demoUuid(1), assignorName: 'Cedente A', externalReference: 'A-001', paymentCurrency: 'BRL' as const, faceValueBrl: '110.00', presentValueBrl: '100.00', paymentValue: '100.00' };
test('agregação separa moedas, preenche dias vazios e mantém indicadores globais', () => {
  const data = aggregateDashboard('LAST_7_DAYS', createBatchStore(), createExchangeStore(), [item, { ...item, uuid: demoUuid(21), paymentCurrency: 'USD', paymentValue: '20.00' }], Date.parse('2026-09-26T12:00:00Z'));
  expect(data.totals).toEqual({ faceValueBrl: '220.00', presentValueBrl: '200.00', discountBrl: '20.00', paymentBrl: '100.00', paymentUsd: '20.00' });
  expect(data.dailyPayments).toHaveLength(7); expect(data.dailyPayments[0]!.paymentBrl).toBe('0.00'); expect(data.batchCounts.READY).toBe(1);
  expect(aggregateDashboard('CURRENT_MONTH', createBatchStore(), createExchangeStore(), [], Date.parse('2026-09-26T12:00:00Z')).dailyPayments).toHaveLength(26);
});
test('gráfico projeta coordenadas limitadas sem arredondar dinheiro de grandeza máxima', () => {
  const result = chartScale(['0.00', '99999999999999999.99', '49999999999999999.99']);
  expect(result.maximum).toBe('99999999999999999.99'); expect(result.heights).toEqual([0, 100, 49.99]);
  expect(chartScale(['0.00']).empty).toBe(true);
});
test('resposta incompleta ou pagamentos negativos não geram gráfico válido', () => {
  expect(dashboardSchema.safeParse({ ...dashboardFixture, dailyPayments: dashboardFixture.dailyPayments.slice(1) }).success).toBe(false);
  expect(dashboardSchema.safeParse({ ...dashboardFixture, dailyPayments: dashboardFixture.dailyPayments.map(row => ({ ...row, paymentUsd: '-1.00' })) }).success).toBe(false);
});
