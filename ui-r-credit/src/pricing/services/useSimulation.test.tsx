import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, test } from 'vitest';
import { delay, http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router';
import type { PropsWithChildren } from 'react';
import { AppProviders } from '../../app/AppProviders';
import { createSession } from '../../auth/services/session';
import { demoProfiles } from '../../auth/mocks/profiles';
import { server } from '../../common/testing/server';
import { simulationFixture } from '../mocks/fixtures';
import { receivableFixture } from '../../batch/mocks/fixtures';
import { inputOf } from '../../batch/services/manualBatch';
import { useSimulation } from './useSimulation';
function wrapper({ children }: PropsWithChildren) {
  const session = createSession(); session.signIn(demoProfiles.operator);
  return <MemoryRouter><AppProviders session={session}>{children}</AppProviders></MemoryRouter>;
}
test('debounce agrupa edições e resposta antiga não substitui simulação atual; erro mantém dados desatualizados', async () => {
  const refs: string[] = [];
  server.use(http.post('/api/simulations', async ({ request }) => {
    const body = await request.json() as { items: { externalReference: string }[] }; const ref = body.items[0]!.externalReference; refs.push(ref);
    if (ref === 'A') await delay(1000);
    if (ref === 'ERROR') return new HttpResponse(null, { status: 503 });
    return HttpResponse.json({ ...simulationFixture, calculationVersion: ref });
  }));
  const { result, rerender } = renderHook(({ ref }) => useSimulation({ items: [{ ...inputOf(receivableFixture), externalReference: ref }] }, true), { wrapper, initialProps: { ref: 'A' } });
  await waitFor(() => expect(refs).toEqual(['A']));
  rerender({ ref: 'B' }); rerender({ ref: 'C' });
  await waitFor(() => expect(result.current.data?.calculationVersion).toBe('C'));
  await act(() => new Promise(resolve => setTimeout(resolve, 800)));
  expect(result.current.data?.calculationVersion).toBe('C'); expect(refs).toEqual(['A', 'C']);
  rerender({ ref: 'ERROR' }); expect(result.current.valid).toBe(false);
  await waitFor(() => expect(result.current.updating).toBe(false));
  expect(result.current.data?.calculationVersion).toBe('C'); expect(result.current.valid).toBe(false);
});
