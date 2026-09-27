import { requestSchema } from '../../../src/settlement/services/contracts';
import { demoUuid, demoTime } from '../../common/testing/demo';
import { demoProfiles } from '../../auth/mocks/profiles';
import { batchFixture } from '../../batch/mocks/fixtures';
import { quoteFixture } from '../../exchange/mocks/fixtures';
export const requestFixture = requestSchema.parse({ uuid: demoUuid(7), batchUuid: batchFixture.uuid, kind: 'INITIAL', reason: null, status: 'PENDING', statusUrl: `/api/settlement-requests/${demoUuid(7)}`, acceptedAt: demoTime, requestedBy: demoProfiles.operator, snapshot: { calculationDate: '2026-09-26', calculationVersion: 'demo-zero-day', dayCountConvention: 'ACTUAL_30', baseRate: '0.02', exchangeRate: quoteFixture }, counts: { ready: 0, pending: 1, settled: 0, failed: 0 }, settledTotals: { faceValueBrl: '0.00', presentValueBrl: '0.00', discountBrl: '0.00', paymentBrl: '0.00', paymentUsd: '0.00' }, completedAt: null });
