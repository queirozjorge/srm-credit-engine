import { createContext, useContext, useSyncExternalStore } from 'react';
import type { Session } from './session';
export const SessionContext = createContext<Session | null>(null);
export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error('Provedor de sessão ausente.');
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  return { ...state, session };
}
