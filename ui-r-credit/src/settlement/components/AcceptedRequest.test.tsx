import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';
import { http, HttpResponse } from 'msw';
import { AppProviders } from '../../app/AppProviders';
import { createSession } from '../../auth/services/session';
import { demoProfiles } from '../../../tests/auth/mocks/profiles';
import { receivableFixture } from '../../../tests/batch/mocks/fixtures';
import { requestFixture } from '../../../tests/settlement/mocks/fixtures';
import { server } from '../../../tests/common/testing/server';
import { demoUuid } from '../../../tests/common/testing/demo';
import { locale, translations } from '../../i18n/pt-BR';
import { requestSchema } from '../services/contracts';
import { RequestHistory } from './RequestHistory';

test('erro histórico preservado após sucesso atual e modal fecha em cinco ciclos', async () => {
  const text = translations[locale];
  const request = requestSchema.parse({ ...requestFixture, status: 'FAILED', completedAt: requestFixture.acceptedAt,
    counts: { ready: 0, pending: 0, settled: 0, failed: 1 } });
  const failure = { code: 'COTACAO_EXPIRADA', message: 'A cotação expirou no aceite anterior.', stage: 'ACCEPTANCE', occurredAt: request.acceptedAt };
  const currentReceivable = { ...receivableFixture, processing: { status: 'SETTLED', hasError: false, failure: null,
    activeRequestUuid: demoUuid(50), attemptNumber: 2, settlementUuid: demoUuid(51) } };
  let reads = 0;
  server.use(http.get('/api/settlement-requests/:uuid/items', () => {
    reads++;
    return HttpResponse.json({ items: [{ uuid: demoUuid(40), requestUuid: request.uuid, receivable: currentReceivable,
      attemptNumber: 1, previousAttemptUuid: null, status: 'FAILED', hasError: true, retryCount: 0, nextRetryAt: null,
      terms: null, completedAt: request.acceptedAt, failure, result: null }], page: 1, size: 5, totalItems: 1, totalPages: 1 });
  }));
  const session = createSession(); session.signIn(demoProfiles.operator, demoProfiles.operator.subject);
  render(<AppProviders session={session}><RequestHistory batchUuid={request.batchUuid} activeRequest={request} /></AppProviders>);
  await userEvent.click(screen.getByRole('button', { name: text.settlement.flow.items }));
  const trigger = await screen.findByRole('button', { name: text.batch.failure });
  await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument());
  for (let cycle = 0; cycle < 5; cycle++) {
    await userEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: text.batch.errorTitle(currentReceivable.externalReference) });
    expect(dialog).toHaveTextContent(failure.message);
    expect(dialog).toHaveTextContent(text.settlement.audit.stage.ACCEPTANCE);
    await userEvent.keyboard('{Escape}'); fireEvent.click(dialog);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: text.batch.errorTitle(currentReceivable.externalReference) })).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  }
  expect(reads).toBe(1);
});
