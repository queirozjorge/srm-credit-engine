import { assignorSchema } from '../services/contracts';
import { demoText, demoTime, demoUuid } from '../../common/testing/demo';
export const assignorFixture = assignorSchema.parse({ uuid: demoUuid(1), name: demoText.assignor, documentNumber: '11222333000181', deleted: false, version: '0', registeredAt: demoTime, updatedAt: null });
