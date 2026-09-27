import { act, render } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { expect, test } from 'vitest';
import { createQueryClient } from '../../common/http/queryClient';
import { createSession } from '../services/session';
import { demoProfiles } from '../mocks/profiles';
import { SessionProvider } from './SessionProvider';
test('troca de identidade esvazia cache de consultas e mutações', () => {
  const client = createQueryClient(); const session = createSession();
  render(<QueryClientProvider client={client}><SessionProvider value={session}><div /></SessionProvider></QueryClientProvider>);
  act(() => session.signIn(demoProfiles.operator));
  client.setQueryData(['assignors'], ['private']);
  client.getMutationCache().build(client, { mutationKey: ['create'], mutationFn: async () => 'private' });
  act(() => session.signIn(demoProfiles.manager));
  expect(client.getQueryCache().getAll()).toHaveLength(0);
  expect(client.getMutationCache().getAll()).toHaveLength(0);
});
