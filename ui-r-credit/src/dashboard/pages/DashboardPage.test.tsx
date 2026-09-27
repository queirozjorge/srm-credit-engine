import { expect, test } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { http, HttpResponse } from 'msw';
import { AppProviders } from '../../app/AppProviders';
import { NavigationMemoryProvider } from '../../app/routes/NavigationMemoryProvider';
import { createSession } from '../../auth/services/session';
import { demoProfiles } from '../../../tests/auth/mocks/profiles';
import { server } from '../../../tests/common/testing/server';
import { dashboardFixture } from '../../../tests/dashboard/mocks/fixtures';
import { locale, translations } from '../../../tests/pt-BR';
import { DashboardPage } from './DashboardPage';

const text = translations[locale];
const copy = text.dashboard;

function openDashboard() {
  const session = createSession();
  session.signIn(demoProfiles.operator, demoProfiles.operator.subject);
  return render(<MemoryRouter initialEntries={['/dashboard']}><AppProviders session={session}><NavigationMemoryProvider><DashboardPage /></NavigationMemoryProvider></AppProviders></MemoryRouter>);
}

test('exibe totais liquidados e contagens globais com uma consulta, sem somar moedas', async () => {
  let dashboardReads = 0;
  const response = {
    ...dashboardFixture,
    totals: { faceValueBrl: '10000.00', presentValueBrl: '9000.00', discountBrl: '1000.00', paymentBrl: '9000.00', paymentUsd: '25.00' },
    dailyPayments: dashboardFixture.dailyPayments.map((row, index) => ({
      ...row,
      paymentBrl: index === 0 ? '9000.00' : '0.00',
      paymentUsd: index === 1 ? '25.00' : '0.00',
    })),
    batchCounts: { READY: 2, PENDING: 3, SETTLED: 4, PARTIALLY_SETTLED: 5, FAILED: 6 },
  };
  server.use(http.get('/api/dashboard', () => {
    dashboardReads++;
    return HttpResponse.json(response);
  }));

  openDashboard();

  expect(await screen.findByRole('heading', { name: copy.totals })).toBeVisible();
  expect(screen.getByText(text.financial.totals.paymentBrl).nextElementSibling).toHaveTextContent('9.000,00');
  expect(screen.getByText(text.financial.totals.paymentUsd).nextElementSibling).toHaveTextContent('25,00');
  expect(screen.getByText(copy.globalHint)).toBeVisible();
  for (const status of ['READY', 'PENDING', 'SETTLED', 'PARTIALLY_SETTLED', 'FAILED'] as const) {
    const count = response.batchCounts[status];
    expect(screen.getByText(text.batch.statuses[status]).nextElementSibling).toHaveTextContent(String(count));
  }
  expect(await screen.findByText(copy.maximum('9.000,00', 'BRL'))).toBeVisible();
  expect(dashboardReads).toBe(1);

  await userEvent.click(screen.getByRole('tab', { name: copy.currencies.USD }));
  expect(await screen.findByText(copy.maximum('25,00', 'USD'))).toBeVisible();
  expect(dashboardReads).toBe(1);
  expect(within(screen.getByRole('tablist', { name: copy.currency })).getByRole('tab', { name: copy.currencies.USD })).toHaveAttribute('aria-selected', 'true');
});
