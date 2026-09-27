import { expect, test } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { http, HttpResponse } from 'msw';
import { AppProviders } from '../../app/AppProviders';
import { NavigationMemoryProvider } from '../../app/routes/NavigationMemoryProvider';
import { createSession } from '../../auth/services/session';
import { demoProfiles } from '../../../tests/auth/mocks/profiles';
import { server } from '../../../tests/common/testing/server';
import { demoTime, demoUuid } from '../../../tests/common/testing/demo';
import { locale, translations } from '../../../tests/pt-BR';
import { StatementPage } from './StatementPage';

const text = translations[locale];
const copy = text.settlement.statement;

function openStatement() {
  const session = createSession();
  session.signIn(demoProfiles.operator, demoProfiles.operator.subject);
  return render(<MemoryRouter initialEntries={['/extrato']}><AppProviders session={session}><NavigationMemoryProvider><StatementPage /></NavigationMemoryProvider></AppProviders></MemoryRouter>);
}

test('mostra títulos já liquidados durante processamento parcial sem consultar estado terminal do lote', async () => {
  let statementReads = 0;
  const items = Array.from({ length: 9 }, (_, index) => ({
    uuid: demoUuid(210 + index),
    batchUuid: demoUuid(301),
    requestUuid: demoUuid(401),
    settledAt: demoTime,
    receivableUuid: demoUuid(501 + index),
    assignorUuid: demoUuid(601),
    assignorName: 'Cedente Parcial Ltda.',
    externalReference: `PARCIAL-${String(index + 1).padStart(2, '0')}`,
    paymentCurrency: index === 8 ? 'USD' as const : 'BRL' as const,
    faceValueBrl: '1000.00',
    presentValueBrl: '900.00',
    paymentValue: index === 8 ? '18.00' : '900.00',
  }));

  server.use(http.get('/api/settlements/items', () => {
    statementReads++;
    return HttpResponse.json({ items, page: 1, size: 20, totalItems: 9, totalPages: 1 });
  }));

  openStatement();

  const table = await screen.findByRole('table', { name: copy.table });
  expect(await screen.findByText(copy.resultCount(9))).toBeVisible();
  expect(within(table).getByText('PARCIAL-01')).toBeVisible();
  expect(within(table).getByText('PARCIAL-09')).toBeVisible();
  expect(table).not.toHaveTextContent('FALHA');
  await waitFor(() => expect(statementReads).toBe(1));
});
