import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';
import { MemoryRouter } from 'react-router';
import { http, HttpResponse } from 'msw';
import { NavigationMemoryProvider } from '../../app/routes/NavigationMemoryProvider';
import { AppProviders } from '../../app/AppProviders';
import { createSession } from '../../auth/services/session';
import { demoProfiles } from '../../../tests/auth/mocks/profiles';
import { batchFixture } from '../../../tests/batch/mocks/fixtures';
import { requestFixture } from '../../../tests/settlement/mocks/fixtures';
import { server } from '../../../tests/common/testing/server';
import { locale, translations } from '../../i18n/pt-BR';
import { SettlementFlow } from './SettlementFlow';

test('confirma sem simulação e mantém cinco ciclos estáveis de fechamento', async () => {
  const text = translations[locale].settlement.flow;
  let posts = 0;
  server.use(http.post('/api/batches/:uuid/settlements', () => { posts++; return HttpResponse.json(requestFixture, { status: 202 }); }));
  const session = createSession(); session.signIn(demoProfiles.operator, demoProfiles.operator.subject);
  render(<MemoryRouter><AppProviders session={session}><NavigationMemoryProvider><SettlementFlow batch={batchFixture} available /></NavigationMemoryProvider></AppProviders></MemoryRouter>);
  const trigger = screen.getByRole('button', { name: text.requestAction });
  expect(trigger).toBeEnabled();
  for (let cycle = 0; cycle < 5; cycle++) {
    await userEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: text.confirmTitle });
    expect(within(dialog).getByText(text.consequence)).toBeVisible();
    await userEvent.keyboard('{Escape}');
    fireEvent.click(dialog);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  }
  expect(posts).toBe(0);
  await userEvent.click(trigger);
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: text.confirm }));
  await waitFor(() => expect(posts).toBe(1));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});
