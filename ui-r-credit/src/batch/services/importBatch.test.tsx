import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, test } from 'vitest';
import type { PropsWithChildren } from 'react';
import { MemoryRouter } from 'react-router';
import { http, HttpResponse, delay } from 'msw';
import { AppProviders } from '../../app/AppProviders';
import { server } from '../../../tests/common/testing/server';
import { createSession } from '../../auth/services/session';
import { demoProfiles } from '../../../tests/auth/mocks/profiles';
import { inputOf } from './manualBatch';
import { previewSchema } from './contracts';
import { receivableFixture } from '../../../tests/batch/mocks/fixtures';
import { importBody, maxImportBytes, validPreview, type ImportFormat } from './importBatch';
import { useImportPreview } from './useImportPreview';
function wrapper({ children }: PropsWithChildren) {
  const session = createSession(); session.signIn(demoProfiles.operator, demoProfiles.operator.subject);
  return <MemoryRouter><AppProviders session={session}>{children}</AppProviders></MemoryRouter>;
}
const preview = { source: 'CSV' as const, itemCount: 1, faceValueBrl: '1000.00', items: [{ ...inputOf(receivableFixture), assignorName: receivableFixture.assignorName, itemIndex: 0, line: 2 }] };
test('prévia valida contagem, índice, total e formato; limite de 1.000 itens', () => {
  expect(validPreview(preview, 'CSV')).toBe(true);
  const items = Array.from({ length: 1000 }, (_, itemIndex) => ({ ...preview.items[0]!, itemIndex }));
  expect(previewSchema.safeParse({ ...preview, itemCount: 1000, faceValueBrl: '1000000.00', items }).success).toBe(true);
  expect(previewSchema.safeParse({ ...preview, itemCount: 1001, items: [...items, items[0]] }).success).toBe(false);
  expect(validPreview(preview, 'CNAB')).toBe(false);
  expect(validPreview({ ...preview, itemCount: 2 }, 'CSV')).toBe(false);
  expect(validPreview({ ...preview, faceValueBrl: '1.00' }, 'CSV')).toBe(false);
  expect(validPreview({ ...preview, items: [{ ...preview.items[0]!, itemIndex: 7 }] }, 'CSV')).toBe(false);
});
test('FormData preserva arquivo; moedas somente CNAB como parte JSON', async () => {
  const file = new File(['original'], 'test.rem');
  const csv = importBody(file, 'CSV', { 0: 'USD' }); expect(csv.get('file')).toBe(file); expect(csv.has('paymentCurrencies')).toBe(false);
  const cnab = importBody(file, 'CNAB', { 0: 'USD' });
  const part = cnab.get('paymentCurrencies') as Blob;
  expect(part.type).toBe('application/json'); expect(JSON.parse(await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsText(part); }))).toEqual([{ itemIndex: 0, paymentCurrency: 'USD' }]);
});
test('arquivo vazio ou acima de 5 MiB não é enviado; limite exato é aceito sem leitura local', async () => {
  let calls = 0;
  server.use(http.post('/api/batches/preview', () => { calls++; return HttpResponse.json(preview); }));
  const { result } = renderHook(() => useImportPreview('CSV'), { wrapper });
  await act(() => result.current.select(new File([], 'vazio.csv'))); expect(result.current.file).toBeNull();
  await act(() => result.current.select(new File([new Uint8Array(maxImportBytes + 1)], 'grande.csv')));
  await act(() => result.current.requestPreview()); expect(calls).toBe(0);
  await act(() => result.current.select(new File([new Uint8Array(maxImportBytes)], 'limite.csv'))); expect(result.current.file?.size).toBe(maxImportBytes);
});
test('422 mantém linhas válidas só para revisão e detalhes truncados, bloqueando importação', async () => {
  server.use(http.post('/api/batches/preview', () => HttpResponse.json({ code: 'ARQUIVO_INVALIDO', message: 'Corrija o arquivo.',
    details: [{ code: 'CAMPO_INVALIDO', message: 'Revise a referência.', field: 'externalReference', line: 3 }], detailsTruncated: true,
    preview: { source: 'CSV', items: preview.items } }, { status: 422 })));
  const { result } = renderHook(() => useImportPreview('CSV'), { wrapper });
  await act(() => result.current.select(new File(['dados'], 'test.csv'))); await act(() => result.current.requestPreview());
  expect(result.current.valid).toBe(false); expect(result.current.preview?.items).toHaveLength(1);
  expect(result.current.issues[0]?.line).toBe(3); expect(result.current.truncated).toBe(true);
});
test('resposta atrasada de arquivo substituído é ignorada e prévia não persiste', async () => {
  let requests = 0;
  server.use(http.post('/api/batches/preview', async () => { requests++; await delay(100); return HttpResponse.json(preview); }));
  const { result, rerender } = renderHook(({ format }: { format: ImportFormat }) => useImportPreview(format), { wrapper, initialProps: { format: 'CSV' } });
  await act(() => result.current.select(new File(['dados'], 'test.csv')));
  let pending: Promise<void> | undefined;
  act(() => { pending = result.current.requestPreview(); });
  await waitFor(() => expect(requests).toBe(1));
  rerender({ format: 'CNAB' }); await act(async () => { await pending; });
  expect(result.current.file).toBeNull(); expect(result.current.preview).toBeNull(); expect(result.current.valid).toBe(false);
});

test('nova consulta do mesmo arquivo preserva moeda CNAB; troca de arquivo limpa escolha', async () => {
  server.use(http.post('/api/batches/preview', () => HttpResponse.json({ ...preview, source: 'CNAB' })));
  const { result } = renderHook(() => useImportPreview('CNAB'), { wrapper });
  await act(() => result.current.select(new File(['original'], 'lote.rem')));
  await act(() => result.current.requestPreview());
  await act(() => result.current.changeCurrency(0, 'USD'));
  await act(() => result.current.requestPreview());
  expect(result.current.currencies).toEqual({ 0: 'USD' });
  await act(() => result.current.select(new File(['outro'], 'outro.rem')));
  expect(result.current.currencies).toEqual({}); expect(result.current.valid).toBe(false);
});
