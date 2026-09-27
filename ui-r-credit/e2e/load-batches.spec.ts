import { mkdir, writeFile } from 'node:fs/promises';
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { generateDataset, loadAssignors } from '../tests/load/dataset';
import { requestSchema } from '../src/settlement/services/contracts';
import { confirmSettlement, importBatch, prepareSettlement, registerAssignor, signIn, verifySettled } from './load/ui';
import { observe, percentiles, type NetworkSample } from './load/diagnostics';

function positiveInteger(raw: string | undefined, fallback: number, maximum: number) {
  const value = Number(raw ?? fallback);
  if (!Number.isInteger(value) || value < 1 || value > maximum) throw new Error(`Parâmetro de carga deve estar entre 1 e ${maximum}.`);
  return value;
}
const concurrency = (process.env.LOAD_CONCURRENCY ?? '1,2,5,10').split(',').map(value => positiveInteger(value, 1, 10));
const rounds = positiveInteger(process.env.LOAD_ROUNDS, 1, 20);
const itemCount = positiveInteger(process.env.LOAD_ITEM_COUNT, 1000, 1000);
const warmup = process.env.LOAD_WARMUP !== '0';
const seed = process.env.LOAD_SEED ?? new Date().toISOString().replace(/\D/g, '');
const calculationDate = process.env.LOAD_DATE ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

test('cadastro, importação e liquidação real pela UI em ondas concorrentes', async ({ browser, baseURL }, info) => {
  const waves = [ ...(warmup ? [{ concurrency: 1, round: 0, warmup: true }] : []),
    ...concurrency.flatMap(count => Array.from({ length: rounds }, (_, round) => ({ concurrency: count, round: round + 1, warmup: false }))) ];
  const output = info.outputPath('datasets');
  await mkdir(output, { recursive: true });
  let number = 0;
  const datasets = waves.map(wave => ({ ...wave, batches: Array.from({ length: wave.concurrency }, () => {
    const data = generateDataset({ seed, calculationDate, batchNumber: number++, itemCount });
    const format = data.manifest.batchNumber % 2 === 0 ? 'CSV' as const : 'CNAB' as const;
    return { data, format, file: `${output}/batch-${String(data.manifest.batchNumber).padStart(3, '0')}.${format.toLowerCase()}` };
  }) }));
  for (const wave of datasets) for (const { data } of wave.batches) {
    const prefix = `${output}/batch-${String(data.manifest.batchNumber).padStart(3, '0')}`;
    await writeFile(`${prefix}.csv`, data.csv);
    await writeFile(`${prefix}.cnab`, data.cnab);
    await writeFile(`${prefix}.json`, JSON.stringify({ ...data.manifest, assignors: data.assignors, items: data.items }, null, 2));
  }
  await writeFile(`${output}/assignors.json`, JSON.stringify(loadAssignors(seed, Math.min(10, itemCount)), null, 2));
  if (process.env.LOAD_GENERATE_ONLY === '1') {
    await info.attach('dataset-directory', { body: output, contentType: 'text/plain' });
    return;
  }

  const contexts: BrowserContext[] = [];
  let managerContext: BrowserContext | undefined;
  const sessions: { page: Page; diagnostics: ReturnType<typeof observe> }[] = [];
  const measuredNetwork: NetworkSample[] = [];
  const results: { concurrency: number; round: number; warmup: boolean; batchUuid: string; requestUuid: string; format: string;
    itemCount: number; acceptedAt: string; completedAt: string | null; acceptedToTerminalMs: number | null; uiElapsedMs: number;
    counts: { ready: number; pending: number; settled: number; failed: number }; faceValueBrl: string }[] = [];
  try {
    managerContext = await browser.newContext({ baseURL, ignoreHTTPSErrors: true, locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo', viewport: { width: 1366, height: 900 } });
    const managerPage = await managerContext.newPage();
    await signIn(managerPage, 'manager');
    for (let index = 0; index < Math.max(...concurrency); index++) {
      const context = await browser.newContext({ baseURL, ignoreHTTPSErrors: true, locale: 'pt-BR',
        timezoneId: 'America/Sao_Paulo', viewport: { width: 1366, height: 900 } });
      contexts.push(context);
      const page = await context.newPage();
      await signIn(page, 'operator');
      sessions.push({ page, diagnostics: observe(page) });
    }
    for (const assignor of loadAssignors(seed, Math.min(10, itemCount))) await registerAssignor(managerPage, assignor);
    for (const wave of datasets) {
      const networkStarts = sessions.map(session => session.diagnostics.network.length);
      const prepared: { page: Page; diagnostics: ReturnType<typeof observe>; batchUuid: string; format: string; expectedFace: string }[] = [];
      // Prepare sequentially; only confirmations are synchronized. Preserve the gateway's real rate limit.
      for (const [index, { data, file, format }] of wave.batches.entries()) {
        const session = sessions[index]!;
        const batchUuid = await importBatch(session.page, file, format, itemCount);
        await prepareSettlement(session.page);
        prepared.push({ ...session, batchUuid, format, expectedFace: data.manifest.faceValueBrl });
      }
      const outcomes = await Promise.allSettled(prepared.map(async ({ page, diagnostics, batchUuid, format, expectedFace }) => {
        const started = Date.now();
        const accepted = await confirmSettlement(page, batchUuid);
        expect(accepted.status()).toBe(202);
        const request = requestSchema.parse(await accepted.json());
        await verifySettled(page);
        await diagnostics.flush();
        const terminal = diagnostics.terminal.get(batchUuid);
        expect(terminal, `Consulta terminal do lote ${batchUuid}`).toBeDefined();
        if (!terminal) throw new Error(`Lote ${batchUuid} sem consulta terminal.`);
        expect(terminal.counts).toEqual({ ready: 0, pending: 0, settled: itemCount, failed: 0 });
        expect(terminal.settledTotals.faceValueBrl).toBe(expectedFace);
        const completedAt = terminal.activeRequest?.completedAt ?? null;
        results.push({ concurrency: wave.concurrency, round: wave.round, warmup: wave.warmup, batchUuid,
          requestUuid: request.uuid, format, itemCount, acceptedAt: request.acceptedAt, completedAt,
          acceptedToTerminalMs: completedAt ? Date.parse(completedAt) - Date.parse(request.acceptedAt) : null,
          uiElapsedMs: Date.now() - started, counts: terminal.counts, faceValueBrl: terminal.settledTotals.faceValueBrl });
        await page.screenshot({ path: info.outputPath(`terminal-${batchUuid}.png`), fullPage: true });
      }));
      const failures = outcomes.flatMap((outcome, index) => outcome.status === 'rejected'
        ? [{ batchUuid: prepared[index]!.batchUuid, error: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason) }] : []);
      await Promise.all(sessions.map(session => session.diagnostics.flush()));
      if (!wave.warmup) sessions.forEach((session, index) => { measuredNetwork.push(...session.diagnostics.network.slice(networkStarts[index])); });
      await writeFile(info.outputPath(`wave-${wave.concurrency}-${wave.round}.json`), JSON.stringify({ ...wave,
        batches: prepared.map(item => ({ batchUuid: item.batchUuid, format: item.format })), failures }, null, 2));
      expect(failures, 'Falhas da onda, consultar diagnósticos antes de repetir.').toEqual([]);
    }
  } finally {
    await Promise.all(sessions.map(session => session.diagnostics.flush()));
    const network = sessions.flatMap(session => session.diagnostics.network);
    const errors = sessions.flatMap(session => session.diagnostics.errors);
    const measured = results.filter(result => !result.warmup);
    const summary = { seed, calculationDate, itemCount, concurrency, rounds, warmup,
      environment: { baseURL, platform: process.platform, architecture: process.arch, node: process.version },
      measuredBatches: measured.length, measuredTitles: measured.reduce((sum, result) => sum + result.itemCount, 0),
      acceptedToTerminal: percentiles(measured.flatMap(result => result.acceptedToTerminalMs === null ? [] : [result.acceptedToTerminalMs])),
      uiElapsed: percentiles(measured.map(result => result.uiElapsedMs)),
      byConcurrency: concurrency.map(count => ({ concurrency: count,
        acceptedToTerminal: percentiles(measured.filter(result => result.concurrency === count).flatMap(result => result.acceptedToTerminalMs === null ? [] : [result.acceptedToTerminalMs])),
        uiElapsed: percentiles(measured.filter(result => result.concurrency === count).map(result => result.uiElapsedMs)) })),
      http: { simulations: percentiles(measuredNetwork.filter(row => row.path === '/api/simulations').map(row => row.durationMs)),
        acceptance: percentiles(measuredNetwork.filter(row => row.method === 'POST' && row.path.endsWith('/settlements')).map(row => row.durationMs)),
        failures: network.filter(row => row.status >= 400) },
      limitations: ['acceptedToTerminal inclui fila; não equivale à métrica de processamento do worker.',
        'P95/P99 descritivos; informar tamanho da amostra e ambiente antes de afirmar SLA.',
        'Telemetria PostgreSQL/Kafka/worker e reconciliação financeira completa são coletadas separadamente.',
        'Login e cadastro/preparação não fazem parte da janela de confirmações concorrentes.'],
      results, errors };
    await writeFile(info.outputPath('diagnostic.json'), JSON.stringify(summary, null, 2));
    await writeFile(info.outputPath('network.json'), JSON.stringify(network, null, 2));
    await info.attach('diagnostic', { path: info.outputPath('diagnostic.json'), contentType: 'application/json' });
    await Promise.all(contexts.map(context => context.close()));
    await managerContext?.close();
  }
});
