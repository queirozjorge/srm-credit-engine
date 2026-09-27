import { receivableInputSchema, type ReceivableInput } from './receivableContracts';
import { createBatchSchema } from './contracts';
export interface DraftItem extends ReceivableInput { localId: string; assignorName: string }
export function financialToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function inputOf(item: ReceivableInput): ReceivableInput {
  return { assignorUuid: item.assignorUuid, externalReference: item.externalReference.trim(), type: item.type,
    faceValueBrl: item.faceValueBrl, dueDate: item.dueDate, paymentCurrency: item.paymentCurrency };
}
export function identityOf(item: ReceivableInput) { return JSON.stringify([item.assignorUuid, item.type, item.externalReference.trim()]); }
export function totalFace(items: readonly ReceivableInput[]) {
  const cents = items.reduce((sum, item) => sum + BigInt(item.faceValueBrl.replace('.', '')), 0n);
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}
export function validateManual(items: readonly ReceivableInput[], today = financialToday()): 'count' | 'invalid' | 'expired' | 'duplicate' | 'total' | null {
  if (items.length < 1 || items.length > 1000) return 'count';
  const inputs = items.map(inputOf);
  if (!createBatchSchema.safeParse({ items: inputs }).success) return 'invalid';
  if (inputs.some(item => item.dueDate < today)) return 'expired';
  if (new Set(inputs.map(identityOf)).size !== inputs.length) return 'duplicate';
  if (BigInt(totalFace(inputs).replace('.', '')) > 9999999999999999999n) return 'total';
  return null;
}
export function itemErrors(item: ReceivableInput, others: readonly ReceivableInput[]) {
  const parsed = receivableInputSchema.safeParse(inputOf(item));
  const errors = new Set(parsed.success ? [] : parsed.error.issues.map(issue => String(issue.path[0])));
  if (item.dueDate && item.dueDate < financialToday()) errors.add('dueDate');
  if (others.some(other => identityOf(other) === identityOf(item))) errors.add('externalReference');
  return errors;
}
