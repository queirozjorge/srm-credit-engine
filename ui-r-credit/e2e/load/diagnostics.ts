import type { Page } from '@playwright/test';
import { batchDetailSchema, type BatchDetail } from '../../src/batch/services/contracts';

export interface NetworkSample { method: string; path: string; status: number; durationMs: number }
export function observe(page: Page) {
  const network: NetworkSample[] = [];
  const terminal = new Map<string, BatchDetail>();
  const errors: string[] = [];
  const tasks: Promise<void>[] = [];
  page.on('pageerror', error => { errors.push(error.message); });
  page.on('response', response => {
    const path = new URL(response.url()).pathname;
    if (!path.startsWith('/api/')) return;
    tasks.push((async () => {
      await response.finished();
      const timing = response.request().timing();
      network.push({ method: response.request().method(), path, status: response.status(), durationMs: timing.responseEnd });
      if (response.ok() && /^\/api\/batches\/[^/]+$/.test(path) && response.request().method() === 'GET') {
        const parsed = batchDetailSchema.safeParse(await response.json());
        if (parsed.success && parsed.data.status !== 'PENDING' && parsed.data.status !== 'READY') terminal.set(parsed.data.uuid, parsed.data);
      }
    })().catch(error => { errors.push(error instanceof Error ? error.message : 'Falha na coleta de resposta.'); }));
  });
  return { network, terminal, errors, flush: async () => { await Promise.all(tasks); } };
}

export function percentiles(values: number[]) {
  const sorted = values.filter(value => value >= 0).sort((a, b) => a - b);
  const valueAt = (fraction: number) => sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? null;
  return { samples: sorted.length, p50: valueAt(0.5), p95: valueAt(0.95), p99: valueAt(0.99), max: sorted.at(-1) ?? null };
}
