import { requestSchema } from '../services/contracts';
import { demoUuid, demoTime } from '../../common/testing/demo';
import { demoProfiles } from '../../auth/mocks/profiles';
import { batchFixture } from '../../batch/mocks/fixtures';
import { quoteFixture } from '../../exchange/mocks/fixtures';
export const requestFixture = requestSchema.parse({ uuid: demoUuid(7), batchUuid: batchFixture.uuid, status: 'PENDING', statusUrl: `/api/settlement-requests/${demoUuid(7)}`, acceptedAt: demoTime, requestedBy: demoProfiles.operator, snapshot: { calculationDate: '2026-09-26', calculationVersion: 'demo-zero-day', dayCountConvention: 'ACTUAL_30', baseRate: '0.02', exchangeRate: quoteFixture }, completedAt: null, result: null, failure: null });
