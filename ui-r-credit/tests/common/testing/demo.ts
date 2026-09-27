import { delay, HttpResponse } from 'msw';
import type { z } from 'zod';
import { can, type Permission } from '../../../src/auth/services/session';
import { demoProfiles } from '../../auth/mocks/profiles';
import { locale, translations } from '../../pt-BR';
export const demoText = translations[locale].demo;
export const demoTime = '2026-09-26T12:00:00Z';
export const demoUuid = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
export function failure(status: number, code: string, message: string = demoText.invalid) { return HttpResponse.json({ code, message }, { status }); }
export function authorize(request: Request, permission: Permission = 'read') {
  const identity = Object.values(demoProfiles).find(p => p.subject === (request.headers.get('Authorization')?.replace(/^Bearer /, '') ?? request.headers.get('X-Demo-Subject')));
  if (!identity) return failure(401, 'SESSAO_INVALIDA', demoText.session);
  if (!can(identity, permission)) return failure(403, 'ACESSO_NEGADO', demoText.denied);
  return null;
}
export function paginated<T>(request: Request, rows: T[]) {
  const params = new URL(request.url).searchParams;
  const p = params.get('page') ?? '1'; const s = params.get('size') ?? '20';
  const page = Number(p); const size = Number(s);
  if (!/^\d+$/.test(p) || !/^\d+$/.test(s) || !Number.isSafeInteger(page) || page < 1 || size < 1 || size > 100) return failure(400, 'PAGINACAO_INVALIDA');
  return HttpResponse.json({ items: rows.slice((page - 1) * size, page * size), page, size, totalItems: rows.length, totalPages: Math.ceil(rows.length / size) });
}
export async function readBody<T>(request: Request, schema: z.ZodType<T>) {
  try { return schema.safeParse(await request.json()); } catch { return { success: false as const }; }
}
// Cenários usados explicitamente em handlers de teste; não dependem de query strings ocultas na aplicação.
export async function scenario(kind: 'network' | 'invalid' | 'empty' | 'slow' | number, payload: unknown = {}) {
  if (kind === 'network') return HttpResponse.error();
  if (kind === 'invalid') return HttpResponse.json({ unexpected: true });
  if (kind === 'empty') return HttpResponse.json({ items: [], page: 1, size: 20, totalItems: 0, totalPages: 0 });
  if (kind === 'slow') { await delay(100); return new HttpResponse(JSON.stringify(payload), { headers: { 'Content-Type': 'application/json' } }); }
  return failure(kind, `DEMO_${kind}`);
}
