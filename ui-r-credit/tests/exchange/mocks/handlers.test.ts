import { expect, test } from 'vitest';
import { server } from '../../common/testing/server';
import { demoProfiles } from '../../auth/mocks/profiles';
import { demoUuid } from '../../common/testing/demo';
import { createExchangeHandlers, createExchangeStore } from './handlers';
import { proposalFixture } from './fixtures';
function decide(uuid: string, status: string, version = '0', subject = demoProfiles.manager.subject, reason?: string) {
  return fetch(`${window.location.origin}/api/exchange/proposals/${uuid}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-Demo-Subject': subject },
    body: JSON.stringify({ status, version, ...(reason ? { decisionReason: reason } : {}) }) });
}
test('mock protege decisão única, rejeição justificada e identidade autenticada', async () => {
  const store = createExchangeStore(); store.proposals[0]!.requestedBy = demoProfiles.combined;
  server.use(...createExchangeHandlers(store));
  expect((await decide(proposalFixture.uuid, 'APPROVED', '0', demoProfiles.combined.subject)).status).toBe(403);
  expect((await decide(proposalFixture.uuid, 'REJECTED')).status).toBe(422);
  expect((await decide(proposalFixture.uuid, 'REJECTED', '0', demoProfiles.manager.subject, 'Taxa divergente.')).status).toBe(204);
  expect((await decide(proposalFixture.uuid, 'APPROVED')).status).toBe(409);
  expect(store.quotes).toHaveLength(1); expect(store.proposals[0]!.decision?.reason).toBe('Taxa divergente.');
});
test('nova cotação não altera proposta pendente nem cria veto por base antiga', async () => {
  const store = createExchangeStore(); store.proposals.push({ ...structuredClone(proposalFixture), uuid: demoUuid(10), proposedRate: '5.20' });
  server.use(...createExchangeHandlers(store));
  expect((await decide(proposalFixture.uuid, 'APPROVED')).status).toBe(204);
  expect(store.proposals[1]).toMatchObject({ status: 'PENDING', proposedRate: '5.20', version: '0' });
  expect((await decide(demoUuid(10), 'APPROVED')).status).toBe(204);
  expect(store.quotes).toHaveLength(3); expect(store.quotes[0]!.rate).toBe('5.20');
});
