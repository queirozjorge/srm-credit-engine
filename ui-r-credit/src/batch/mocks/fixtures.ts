import { batchDetailSchema } from '../services/contracts';
import { receivableSchema } from '../services/receivableContracts';
import { assignorFixture } from '../../register/mocks/fixtures';
import { demoProfiles } from '../../auth/mocks/profiles';
import { demoUuid, demoTime, demoText } from '../../common/testing/demo';
export const batchFixture = batchDetailSchema.parse({ uuid: demoUuid(2), source: 'FORM', status: 'READY', itemCount: 1, assignorCount: 1, soleAssignor: { uuid: assignorFixture.uuid, name: assignorFixture.name }, faceValueBrl: '1000.00', registeredAt: demoTime, createdBy: demoProfiles.operator, activeRequest: null });
export const receivableFixture = receivableSchema.parse({ uuid: demoUuid(3), assignorUuid: assignorFixture.uuid, assignorName: assignorFixture.name, externalReference: demoText.reference, type: 'DUPLICATA_MERCANTIL', faceValueBrl: '1000.00', dueDate: '2026-09-26', paymentCurrency: 'BRL' });
