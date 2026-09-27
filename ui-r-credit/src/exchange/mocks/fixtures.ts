import { proposalSchema, quoteSchema } from '../services/contracts';
import { demoUuid, demoTime, demoText } from '../../common/testing/demo';
import { demoProfiles } from '../../auth/mocks/profiles';
export const quoteFixture = quoteSchema.parse({ uuid: demoUuid(4), proposalUuid: demoUuid(5), rate: '5.00', effectiveFrom: demoTime, validUntil: '2026-09-27T12:00:00Z' });
export const proposalFixture = proposalSchema.parse({ uuid: demoUuid(6), proposedRate: '5.10', justification: demoText.justification, status: 'PENDING', requestedBy: demoProfiles.operator, registeredAt: demoTime, version: '0', decision: null });
