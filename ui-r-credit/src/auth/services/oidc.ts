import Keycloak from 'keycloak-js';
import { z } from 'zod';
import { oidcConfig } from '../config/oidc';
import { safeReturnTo } from './returnTo';
import type { Session } from './session';

const destinationKey = 'srm.auth.returnTo';
const claims = z.object({ iss: z.string(), sub: z.string().min(1), exp: z.number(), nbf: z.number().optional(),
  azp: z.literal('ui-r-credit'), aud: z.union([z.string(), z.array(z.string())]),
  realm_access: z.object({ roles: z.array(z.string()) }).optional() });
export function identityFromToken(value: unknown, issuer: string, now = Date.now() / 1000) {
  const data = claims.parse(value);
  if (data.iss !== issuer || data.exp <= now || (data.nbf !== undefined && data.nbf > now) ||
      !(Array.isArray(data.aud) ? data.aud : [data.aud]).includes('spe-j-engine')) throw new Error('Sessão incompatível.');
  return { issuer: data.iss, subject: data.sub, roles: (data.realm_access?.roles ?? []).filter((role): role is 'OPERADOR' | 'GESTOR' => role === 'OPERADOR' || role === 'GESTOR') };
}
export function takeDestination(storage: Storage = sessionStorage) {
  const raw = storage.getItem(destinationKey); storage.removeItem(destinationKey);
  try { const parsed: unknown = JSON.parse(raw ?? 'null');
    const value = z.object({ path: z.string(), at: z.number() }).parse(parsed);
    return Date.now() - value.at >= 0 && Date.now() - value.at < 600_000 ? safeReturnTo(value.path) : '/dashboard';
  } catch { return '/dashboard'; }
}
export type OidcAdapter = Pick<Keycloak, 'init' | 'createLoginUrl' | 'createLogoutUrl' | 'updateToken' | 'clearToken' | 'token' | 'onTokenExpired' | 'onAuthLogout' | 'timeSkew'> & { tokenParsed?: unknown };
export function createOidc(session: Session, adapter: OidcAdapter = new Keycloak(oidcConfig()), redirect = (url: string) => window.location.assign(url)) {
  const root = `${window.location.origin}/`; const issuer = `${oidcConfig().url}/realms/srm-credit`;
  let generation = 0; let timer: ReturnType<typeof setTimeout> | undefined; let pending: Promise<void> | undefined;
  function clear() { generation++; clearTimeout(timer); adapter.onAuthLogout = undefined; adapter.clearToken(); }
  function expire() { session.expire(); }
  function publish() {
    if (!adapter.token) throw new Error('Sessão ausente.');
    const now = Date.now() / 1000 - (adapter.timeSkew ?? 0);
    const identity = identityFromToken(adapter.tokenParsed, issuer, now);
    session.refresh(identity, adapter.token);
    clearTimeout(timer);
    timer = setTimeout(() => { void prepare().catch(() => undefined); }, Math.max(1000, (claims.parse(adapter.tokenParsed).exp - now - 30) * 1000));
  }
  function bounded<T>(work: Promise<T>): Promise<T> {
    let timedOut = false; let timeout: ReturnType<typeof setTimeout>;
    const guarded = work.then(value => { if (timedOut) adapter.clearToken(); return value; });
    return Promise.race([guarded, new Promise<never>((_, reject) => {
      timeout = setTimeout(() => { timedOut = true; reject(new Error('Tempo de acesso excedido.')); }, 15_000);
    })]).finally(() => clearTimeout(timeout));
  }
  async function prepare() {
    if (!session.getSnapshot().identity) return;
    if (pending) return pending;
    const expected = generation;
    pending = (async () => {
      try {
        await bounded(adapter.updateToken(30));
        if (expected !== generation) { adapter.clearToken(); return; }
        publish();
      } catch { if (expected === generation) expire(); throw new Error('Sessão expirada.'); }
      finally { pending = undefined; }
    })();
    return pending;
  }
  session.configureAuthentication({ clear, prepare,
    login: async destination => {
      sessionStorage.setItem(destinationKey, JSON.stringify({ path: safeReturnTo(destination), at: Date.now() }));
      try { redirect(await adapter.createLoginUrl({ redirectUri: root, locale: 'pt-BR' })); }
      catch (error) { sessionStorage.removeItem(destinationKey); throw error; }
    },
    logout: async () => { const url = adapter.createLogoutUrl({ redirectUri: root }); session.signOut(); sessionStorage.removeItem(destinationKey); redirect(url); },
  });
  adapter.onTokenExpired = () => { void prepare().catch(() => undefined); };
  adapter.onAuthLogout = expire;
  return { async initialize() {
    const url = new URL(window.location.href);
    const callback = ['code', 'error', 'state'].some(key => url.searchParams.has(key));
    try {
      const invalidPath = callback && url.pathname !== '/';
      if (invalidPath) window.history.replaceState(null, '', '/entrar');
      const authenticated = await bounded(adapter.init({ flow: 'standard', pkceMethod: 'S256', responseMode: 'query', useNonce: true,
        checkLoginIframe: false, redirectUri: root, enableLogging: false }));
      if (invalidPath) throw new Error('Retorno inválido.');
      if (authenticated) { publish(); if (callback) window.history.replaceState(null, '', takeDestination()); }
      else if (callback) throw new Error('Retorno inválido.');
    } catch { clear(); session.signOut(); sessionStorage.removeItem(destinationKey); window.history.replaceState(null, '', '/entrar'); throw new Error('Não foi possível concluir o acesso.'); }
    finally {
      // Remove artefatos de retorno antes de montar o roteador, inclusive em callbacks inválidos.
      const clean = new URL(window.location.href);
      for (const key of ['code', 'state', 'session_state', 'iss', 'error', 'error_description', 'error_uri']) clean.searchParams.delete(key);
      window.history.replaceState(window.history.state, '', clean.pathname + clean.search);
    }
  } };
}
