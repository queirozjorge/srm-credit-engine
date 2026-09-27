import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { MemoryRouter } from 'react-router';
import { NavigationMemoryProvider } from '../../app/routes/NavigationMemoryProvider';
import { AppProviders } from '../../app/AppProviders';
import { createSession } from '../../auth/services/session';
import { demoProfiles } from '../../../tests/auth/mocks/profiles';
import { batchFixture } from '../../../tests/batch/mocks/fixtures';
import { locale, translations } from '../../i18n/pt-BR';
import { SettlementFlow } from './SettlementFlow';

test('mantém a aba de solicitações sem ação para iniciar liquidação', () => {
  const text = translations[locale].settlement.flow;
  const session = createSession(); session.signIn(demoProfiles.operator, demoProfiles.operator.subject);
  render(<MemoryRouter><AppProviders session={session}><NavigationMemoryProvider><SettlementFlow batch={batchFixture} available /></NavigationMemoryProvider></AppProviders></MemoryRouter>);
  expect(screen.queryByRole('button', { name: text.requestAction })).not.toBeInTheDocument();
});
