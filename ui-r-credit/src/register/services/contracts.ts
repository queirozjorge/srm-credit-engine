import { validCnpj } from './validation';
import { z } from 'zod';
import { uuid, version, instant, pageOf } from '../../common/http/contracts';
export const assignorSchema = z.object({ uuid, name: z.string().min(1).max(150), documentNumber: z.string().regex(/^[A-Z0-9]{12}\d{2}$/), deleted: z.boolean(), version, registeredAt: instant, updatedAt: instant.nullable() });
export const assignorPageSchema = pageOf(assignorSchema);
export const createAssignorSchema = z.strictObject({ name: z.string().trim().min(1).max(150), documentNumber: assignorSchema.shape.documentNumber.refine(validCnpj) });
export const editAssignorSchema = z.strictObject({ name: createAssignorSchema.shape.name, version });
export type Assignor = z.infer<typeof assignorSchema>;
