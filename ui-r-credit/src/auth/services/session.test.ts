import { expect, test } from 'vitest';
import { can, canDecide, createSession } from './session';
import { demoProfiles } from '../../../tests/auth/mocks/profiles';
import { safeReturnTo } from './returnTo';
test('matriz de permissões, acúmulo de papéis e proibição de autoaprovação', () => {
  expect(can(null, 'read')).toBe(false);
  expect(can({ ...demoProfiles.operator, roles: [] }, 'read')).toBe(false);
  expect(can(demoProfiles.manager, 'assignorWrite')).toBe(true);
  for (const permission of ['batchWrite', 'simulate', 'settle', 'propose'] as const) {
    expect(can(demoProfiles.operator, permission)).toBe(true);
    expect(can(demoProfiles.manager, permission)).toBe(false);
    expect(can(demoProfiles.combined, permission)).toBe(true);
  }
  expect(canDecide(demoProfiles.manager, demoProfiles.operator)).toBe(true);
  expect(canDecide(demoProfiles.combined, demoProfiles.combined)).toBe(false);
});
test('troca, saída e expiração apagam token e cancelam operações anteriores', () => {
  const session = createSession(); session.signIn(demoProfiles.operator, 'secret'); const signal = session.signal();
  session.signIn(demoProfiles.manager); expect(signal.aborted).toBe(true); expect(session.token()).toBeNull();
  session.expire(); expect(session.getSnapshot()).toEqual({ identity: null, expired: true });
  session.signIn(demoProfiles.operator, demoProfiles.operator.subject); session.signOut(); expect(session.getSnapshot()).toEqual({ identity: null, expired: false });
});
test('retorno preserva destino local e rejeita redirecionamento externo', () => {
  expect(safeReturnTo('/lotes?page=3')).toBe('/lotes?page=3');
  for (const url of ['https://example.com', '//example.com', '/\\example.com', null]) expect(safeReturnTo(url)).toBe('/dashboard');
});
