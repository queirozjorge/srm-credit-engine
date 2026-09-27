import { z } from 'zod';
export const identitySchema = z.object({ issuer: z.string().min(1), subject: z.string().min(1), roles: z.array(z.enum(['OPERADOR', 'GESTOR'])), displayName: z.string().trim().min(1).optional() });
export type Identity = z.infer<typeof identitySchema>;
export function actorDisplayName(actor: { issuer: string; subject: string; displayName?: string | null }, identity: Identity | null, unknownName: string) {
  const storedName = actor.displayName?.trim();
  if (storedName) return storedName;
  const currentName = identity?.issuer === actor.issuer && identity.subject === actor.subject ? identity.displayName?.trim() : undefined;
  if (currentName) return currentName;
  return /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(actor.subject) ? unknownName : actor.subject;
}
export type Permission = 'read' | 'assignorWrite' | 'batchWrite' | 'simulate' | 'settle' | 'propose' | 'decide';
export function can(identity: Identity | null, permission: Permission) {
  if (!identity) return false;
  return identity.roles.some(role => permission === 'read' || permission === 'assignorWrite' ||
    (permission === 'decide' ? role === 'GESTOR' : role === 'OPERADOR'));
}
export function canDecide(identity: Identity | null, requester: { issuer: string; subject: string }) {
  return can(identity, 'decide') && !(identity?.issuer === requester.issuer && identity.subject === requester.subject);
}
interface Authentication {
  login: (destination: string) => Promise<void>; logout: () => Promise<void>;
  prepare: () => Promise<void>; clear: () => void;
}
export function createSession() {
  let authentication: Authentication | undefined;
  let identity: Identity | null = null;
  let token: string | null = null;
  let expired = false;
  let controller = new AbortController();
  let snapshot = { identity, expired } as { identity: Identity | null; expired: boolean };
  const listeners = new Set<() => void>();
  function change(next: Identity | null, nextToken: string | null, isExpired = false) {
    controller.abort(); controller = new AbortController();
    identity = next ? identitySchema.parse(next) : null; token = nextToken; expired = isExpired;
    snapshot = { identity, expired }; listeners.forEach(listener => listener());
  }
  return { getSnapshot: () => snapshot, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    signal: () => controller.signal, token: () => token,
    signIn: (next: Identity, accessToken: string | null = null) => change(next, accessToken),
    configureAuthentication: (value: Authentication) => { authentication = value; },
    login: (destination: string) => authentication ? authentication.login(destination) : Promise.reject(new Error('Acesso indisponível.')),
    logout: () => authentication ? authentication.logout() : Promise.resolve(change(null, null)),
    prepare: async () => { await authentication?.prepare(); },
    refresh: (next: Identity, accessToken: string) => {
      const valid = identitySchema.parse(next);
      if (identity?.issuer === valid.issuer && identity.subject === valid.subject && identity.displayName === valid.displayName && [...identity.roles].sort().join() === [...valid.roles].sort().join()) token = accessToken;
      else change(valid, accessToken);
    },
    signOut: () => { authentication?.clear(); change(null, null); },
    expire: () => { authentication?.clear(); change(null, null, true); },
  };
}
export type Session = ReturnType<typeof createSession>;
