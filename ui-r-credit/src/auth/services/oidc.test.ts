import { afterEach, expect, test, vi } from 'vitest';
import { createOidc, identityFromToken, takeDestination, type OidcAdapter } from './oidc';
import { createSession } from './session';
const issuer = `${window.location.origin}/auth/realms/srm-credit`;
const token = () => ({ iss: issuer, sub: 'operator', exp: Date.now() / 1000 + 300, azp: 'ui-r-credit', aud: ['spe-j-engine'], realm_access: { roles: ['OPERADOR', 'default-roles'] } });
function adapter(): OidcAdapter { return { timeSkew: 0, token: 'access', tokenParsed: token(), init: vi.fn().mockResolvedValue(true), updateToken: vi.fn().mockResolvedValue(false), clearToken: vi.fn(), createLoginUrl: vi.fn().mockResolvedValue('https://identity.test/login'), createLogoutUrl: vi.fn().mockReturnValue('https://identity.test/logout') }; }
afterEach(() => { vi.useRealTimers(); sessionStorage.clear(); window.history.replaceState(null, '', '/'); });
test('identidade valida issuer, público, cliente e validade; seleciona somente papéis conhecidos', () => {
  expect(identityFromToken(token(), issuer).roles).toEqual(['OPERADOR']);
  for (const changed of [{ iss: 'https://evil.test' }, { aud: 'other' }, { azp: 'other' }, { exp: 0 }, { nbf: Date.now() / 1000 + 60 }]) expect(() => identityFromToken({ ...token(), ...changed }, issuer)).toThrow();
});
test('inicializa PKCE, preserva filtros e consome destino sem manter tokens em storage', async () => {
  const session = createSession(); const kc = adapter(); const redirect = vi.fn(); const oidc = createOidc(session, kc, redirect);
  await session.login('/lotes?page=3'); expect(redirect).toHaveBeenCalledWith('https://identity.test/login');
  window.history.replaceState(null, '', '/?code=one&state=state'); await oidc.initialize();
  expect(kc.init).toHaveBeenCalledWith(expect.objectContaining({ flow: 'standard', pkceMethod: 'S256', useNonce: true, checkLoginIframe: false }));
  expect(window.location.pathname + window.location.search).toBe('/lotes?page=3'); expect(sessionStorage.length).toBe(0);
  expect(session.token()).toBe('access'); session.signOut();
});
test('retorno sem estado validado pelo adaptador limpa URL e permanece sem sessão', async () => {
  const session = createSession(); const kc = adapter(); vi.mocked(kc.init).mockResolvedValue(false);
  window.history.replaceState(null, '', '/?code=invalid&state=invalid&error_description=sensitive');
  await expect(createOidc(session, kc).initialize()).rejects.toThrow();
  expect(window.location.pathname + window.location.search).toBe('/entrar'); expect(session.token()).toBeNull();
});
test('renovação concorrente é única e não cancela requisições nem notifica caches', async () => {
  const session = createSession(); const kc = adapter(); await createOidc(session, kc).initialize();
  const changed = vi.fn(); session.subscribe(changed); const signal = session.signal();
  kc.token = 'renewed'; await Promise.all([session.prepare(), session.prepare()]);
  expect(kc.updateToken).toHaveBeenCalledTimes(1); expect(session.token()).toBe('renewed'); expect(signal.aborted).toBe(false); expect(changed).not.toHaveBeenCalled(); session.signOut();
});
test('mudança de papel invalida sessão anterior e falha de renovação expira', async () => {
  const session = createSession(); const kc = adapter(); await createOidc(session, kc).initialize(); const signal = session.signal();
  kc.tokenParsed = { ...token(), realm_access: { roles: ['GESTOR'] } }; await session.prepare(); expect(signal.aborted).toBe(true);
  vi.mocked(kc.updateToken).mockRejectedValue(new Error('offline')); await expect(session.prepare()).rejects.toThrow();
  expect(session.getSnapshot()).toEqual({ identity: null, expired: true }); expect(session.token()).toBeNull();
});
test('resposta tardia após logout não restaura identidade ou tokens', async () => {
  const session = createSession(); const kc = adapter(); const redirect = vi.fn(); await createOidc(session, kc, redirect).initialize();
  let resolve!: (value: boolean) => void; vi.mocked(kc.updateToken).mockReturnValue(new Promise(done => { resolve = done; }));
  const pending = session.prepare(); await session.logout(); resolve(true); await pending;
  expect(redirect).toHaveBeenCalledWith('https://identity.test/logout'); expect(session.token()).toBeNull(); expect(session.getSnapshot().identity).toBeNull();
});
test('renovação travada expira em quinze segundos sem deixar chamada financeira aguardando', async () => {
  vi.useFakeTimers(); const session = createSession(); const kc = adapter(); await createOidc(session, kc).initialize();
  vi.mocked(kc.updateToken).mockReturnValue(new Promise(() => undefined));
  const failed = expect(session.prepare()).rejects.toThrow(); await vi.advanceTimersByTimeAsync(15_000); await failed;
  expect(session.getSnapshot().expired).toBe(true);
});
test('destino expirado ou externo não causa redirecionamento aberto', () => {
  for (const path of ['//evil.test', 'https://evil.test']) { sessionStorage.setItem('srm.auth.returnTo', JSON.stringify({ path, at: Date.now() })); expect(takeDestination()).toBe('/dashboard'); }
  sessionStorage.setItem('srm.auth.returnTo', JSON.stringify({ path: '/lotes', at: Date.now() - 700_000 })); expect(takeDestination()).toBe('/dashboard');
});
