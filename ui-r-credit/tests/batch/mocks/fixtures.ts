import { batchDetailSchema } from '../../../src/batch/services/contracts';
import { receivableSchema } from '../../../src/batch/services/receivableContracts';
import { assignorFixture } from '../../register/mocks/fixtures';
import { demoProfiles } from '../../auth/mocks/profiles';
import { demoUuid, demoTime, demoText } from '../../common/testing/demo';
export const batchFixture = batchDetailSchema.parse({ uuid: demoUuid(2), source: 'FORM', status: 'READY', itemCount: 1, counts: { ready: 1, pending: 0, settled: 0, failed: 0 }, assignorCount: 1, soleAssignor: { uuid: assignorFixture.uuid, name: assignorFixture.name }, representativeExternalReference: demoText.reference, faceValueBrl: '1000.00', registeredAt: demoTime, createdBy: demoProfiles.operator, activeRequest: null, settledTotals: { faceValueBrl: '0.00', presentValueBrl: '0.00', discountBrl: '0.00', paymentBrl: '0.00', paymentUsd: '0.00' }, progressVersion: '0' });
export const receivableFixture = receivableSchema.parse({ uuid: demoUuid(3), assignorUuid: assignorFixture.uuid, assignorName: assignorFixture.name, externalReference: demoText.reference, type: 'DUPLICATA_MERCANTIL', faceValueBrl: '1000.00', dueDate: '2026-09-26', paymentCurrency: 'BRL', processing: { status: 'READY', hasError: false, failure: null, activeRequestUuid: null, attemptNumber: 0, settlementUuid: null } });
