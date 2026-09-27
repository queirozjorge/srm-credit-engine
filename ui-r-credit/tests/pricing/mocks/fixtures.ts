import { simulationSchema } from '../../../src/pricing/services/contracts';
import { demoTime } from '../../common/testing/demo';
import { receivableFixture } from '../../batch/mocks/fixtures';
import { quoteFixture } from '../../exchange/mocks/fixtures';
export const simulationFixture = simulationSchema.parse({ calculatedAt: demoTime, calculationDate: '2026-09-26', indicative: true, calculationVersion: 'demo-zero-day', baseRate: '0.02', exchangeRate: quoteFixture, totals: { faceValueBrl: '1000.00', presentValueBrl: '1000.00', discountBrl: '0.00', paymentBrl: '1000.00', paymentUsd: '0.00' }, items: [{ itemIndex: 0, receivableUuid: receivableFixture.uuid, days: 0, spread: '0.00', termMonths: '0', presentValueBrl: '1000.00', discountBrl: '0.00', paymentCurrency: 'BRL', paymentValue: '1000.00' }] });
