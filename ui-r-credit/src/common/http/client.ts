import { z } from 'zod';
import { apiErrorSchema } from './contracts';
import { locale, translations } from '../../i18n/pt-BR';
const text = translations[locale].http;
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string,
    public details: z.infer<typeof apiErrorSchema>['details'] = [],
    public context?: z.infer<typeof apiErrorSchema>['context'], public payload?: unknown) { super(message); }
}
export interface RequestOptions<T> {
  schema: z.ZodType<T>; method?: 'GET' | 'POST' | 'PATCH'; body?: unknown;
  signal?: AbortSignal; statuses?: number[]; idempotencyKey?: string; timeoutMs?: number;
  query?: Record<string, string | number | boolean | undefined>; notify?: boolean;
}
export interface ClientDependencies {
  prepare?: () => Promise<void>; token?: () => string | null; sessionSignal?: () => AbortSignal;
  onUnauthorized?: () => void; onError?: (error: ApiError) => void;
  headers?: () => Record<string, string>;
}
export function createApiClient(dependencies: ClientDependencies = {}) {
  return { async request<T>(path: string, options: RequestOptions<T>): Promise<{ data: T; status: number; location: string | null }> {
    if (!/^\/api\/(?!.*(?:\.\.|\\|#|\?))[^:]+$/.test(path)) throw new Error('Caminho de API inválido.');
    const query = new URLSearchParams();
    Object.entries(options.query ?? {}).forEach(([key, value]) => { if (value !== undefined && value !== '') query.set(key, String(value)); });
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), options.timeoutMs ?? 15000);
    const sessionSignal = dependencies.sessionSignal?.();
    const signal = AbortSignal.any([timeout.signal, ...[sessionSignal, options.signal].filter((s): s is AbortSignal => Boolean(s))]);
    try {
      await dependencies.prepare?.();
      signal.throwIfAborted();
      const headers = new Headers(dependencies.headers?.());
      headers.set('Accept', 'application/json');
      const token = dependencies.token?.(); if (token) headers.set('Authorization', `Bearer ${token}`);
      if (options.idempotencyKey) headers.set('Idempotency-Key', options.idempotencyKey);
      const form = options.body instanceof FormData;
      if (options.body !== undefined && !form) headers.set('Content-Type', 'application/json');
      const response = await fetch(`${path}${query.size ? `?${query}` : ''}`, { method: options.method ?? 'GET', headers,
        body: options.body === undefined ? undefined : form ? options.body as FormData : JSON.stringify(options.body), signal, credentials: 'same-origin', cache: 'no-store', redirect: 'error' });
      let payload: unknown;
      if (response.status !== 204) {
        const raw = await response.text();
        try { payload = raw ? JSON.parse(raw) : undefined; } catch { payload = undefined; }
      }
      signal.throwIfAborted();
      if (!response.ok) {
        const parsed = apiErrorSchema.safeParse(payload);
        const safe = parsed.success && response.status < 500;
        throw new ApiError(response.status, parsed.success ? parsed.data.code : 'HTTP_ERROR', safe ? parsed.data.message : text.status(response.status),
          safe ? parsed.data.details : [], parsed.success ? parsed.data.context : undefined, payload);
      }
      if (!(options.statuses ?? [200]).includes(response.status)) throw new ApiError(response.status, 'INVALID_RESPONSE', text.invalidResponse);
      const parsed = options.schema.safeParse(payload);
      if (!parsed.success) throw new ApiError(response.status, 'INVALID_RESPONSE', text.invalidResponse);
      return { data: parsed.data, status: response.status, location: response.headers.get('Location') };
    } catch (cause) {
      if (options.signal?.aborted || sessionSignal?.aborted) throw new DOMException('Requisição cancelada.', 'AbortError');
      const error = cause instanceof ApiError ? cause : new ApiError(0, timeout.signal.aborted ? 'TIMEOUT' : 'NETWORK_ERROR', timeout.signal.aborted ? text.timeout : text.network);
      if (error.status === 401) dependencies.onUnauthorized?.();
      if (options.notify !== false) dependencies.onError?.(error);
      throw error;
    } finally { clearTimeout(timer); }
  } };
}
