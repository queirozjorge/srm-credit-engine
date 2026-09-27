import { z } from 'zod';
import { uuid, instant, rate, actor, version, pageOf } from '../../common/http/contracts';
export const quoteSchema = z.object({ uuid, proposalUuid: uuid, rate, effectiveFrom: instant, validUntil: instant });
const decision = z.discriminatedUnion('status', [
  z.object({ status: z.literal('APPROVED'), decidedBy: actor, decidedAt: instant, reason: z.string().nullable(), quote: quoteSchema }),
  z.object({ status: z.literal('REJECTED'), decidedBy: actor, decidedAt: instant, reason: z.string().min(1), quote: z.null() }),
]);
export const proposalSchema = z.object({ uuid, proposedRate: rate, justification: z.string(), status: z.enum(['PENDING', 'APPROVED', 'REJECTED']), requestedBy: actor, registeredAt: instant, version, decision: decision.nullable() })
  .refine(p => p.status === 'PENDING' ? p.decision === null : p.decision?.status === p.status);
export const exchangeViewSchema = z.object({ evaluatedAt: instant, current: quoteSchema.nullable(), currentStatus: z.enum(['VALID', 'EXPIRED', 'ABSENT']), history: z.discriminatedUnion('kind', [z.object({ kind: z.literal('proposals'), page: pageOf(proposalSchema) }), z.object({ kind: z.literal('quotes'), page: pageOf(quoteSchema) })]) })
  .refine(v => (v.currentStatus === 'ABSENT') === (v.current === null));
export const referenceSchema = z.object({ rate, observedAt: instant });
export const createProposalSchema = z.strictObject({ proposedRate: rate.refine(v => /[1-9]/.test(v)), justification: z.string().trim().min(1).max(500) });
export const decideProposalSchema = z.strictObject({ status: z.enum(['APPROVED', 'REJECTED']), version, decisionReason: z.string().trim().min(1).max(500).optional() }).refine(v => v.status !== 'REJECTED' || Boolean(v.decisionReason));
export type ExchangeProposal = z.infer<typeof proposalSchema>;
