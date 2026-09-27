import { z } from 'zod';
import { uuid } from '../../common/http/contracts';

export const reprocessRequestSchema = z.object({
  receivableUuids: z.array(uuid).min(1).max(1000),
  reason: z.string().trim().min(1).max(500),
}).superRefine((request, context) => {
  const normalized = request.receivableUuids.map(value => value.toLowerCase());
  if (new Set(normalized).size !== normalized.length) {
    context.addIssue({ code: 'custom', path: ['receivableUuids'], message: 'Os títulos selecionados não podem se repetir.' });
  }
}).transform(request => ({
  receivableUuids: request.receivableUuids.map(value => value.toLowerCase()).sort(),
  reason: request.reason,
}));

export type ReprocessRequest = z.output<typeof reprocessRequestSchema>;
