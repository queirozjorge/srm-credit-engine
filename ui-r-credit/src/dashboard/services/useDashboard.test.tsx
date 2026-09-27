import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, test } from 'vitest';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router';
import type { PropsWithChildren } from 'react';
import { AppProviders } from '../../app/AppProviders';
import { createSession } from '../../auth/services/session';
import { demoProfiles } from '../../../tests/auth/mocks/profiles';
import { server } from '../../../tests/common/testing/server';
import { dashboardFixture } from '../../../tests/dashboard/mocks/fixtures';
import { useDashboard } from './useDashboard';
function wrapper({ children }: PropsWithChildren) { const session = createSession(); session.signIn(demoProfiles.operator, demoProfiles.operator.subject); return <MemoryRouter><AppProviders session={session}>{children}</AppProviders></MemoryRouter>; }
test('troca de período com erro mantém dados anteriores desatualizados e só repete sob ação', async () => {
  let calls = 0; server.use(http.get('/api/dashboard', ({ request }) => { calls++; return new URL(request.url).searchParams.get('period') === 'LAST_7_DAYS' ? HttpResponse.json(dashboardFixture) : new HttpResponse(null, { status: 503 }); }));
  const { result, rerender } = renderHook(({ period }: { period: 'LAST_7_DAYS' | 'CURRENT_MONTH' }) => useDashboard(period), { wrapper, initialProps: { period: 'LAST_7_DAYS' } });
  await waitFor(() => expect(result.current.data).toEqual(dashboardFixture));
  rerender({ period: 'CURRENT_MONTH' }); await waitFor(() => expect(result.current.isError).toBe(true));
  expect(result.current.data).toEqual(dashboardFixture); expect(result.current.outdated).toBe(true); expect(calls).toBe(2);
  await act(() => result.current.refetch()); expect(calls).toBe(3); expect(result.current.data).toEqual(dashboardFixture);
});
