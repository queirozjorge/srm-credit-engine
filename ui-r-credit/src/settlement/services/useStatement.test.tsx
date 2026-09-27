import { renderHook, waitFor } from '@testing-library/react';
import { expect, test } from 'vitest';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router';
import type { PropsWithChildren } from 'react';
import { AppProviders } from '../../app/AppProviders';
import { createSession } from '../../auth/services/session';
import { demoProfiles } from '../../auth/mocks/profiles';
import { server } from '../../common/testing/server';
import { useStatement } from './useStatement';
import { statementFilters } from './statementFilters';
function wrapper({ children }: PropsWithChildren) { const session = createSession(); session.signIn(demoProfiles.operator); return <MemoryRouter><AppProviders session={session}>{children}</AppProviders></MemoryRouter>; }
test('página com erro conserva resposta anterior; filtro inválido não abre consulta', async () => {
  let calls = 0; const data = { items: [], page: 1, size: 20, totalItems: 0, totalPages: 0 };
  server.use(http.get('/api/settlements/items', ({ request }) => { calls++; return new URL(request.url).searchParams.get('page') === '1' ? HttpResponse.json(data) : new HttpResponse(null, { status: 503 }); }));
  const { result, rerender } = renderHook(({ search }) => useStatement(statementFilters(new URLSearchParams(search))), { wrapper, initialProps: { search: 'from=&to=' } });
  await waitFor(() => expect(result.current.data).toEqual(data));
  rerender({ search: 'from=&to=&page=2' }); await waitFor(() => expect(result.current.isError).toBe(true));
  expect(result.current.data).toEqual(data); expect(result.current.outdated).toBe(true); expect(calls).toBe(2);
  rerender({ search: 'from=2026-10-01&to=2026-09-01' }); expect(result.current.data).toEqual(data); expect(calls).toBe(2);
});
