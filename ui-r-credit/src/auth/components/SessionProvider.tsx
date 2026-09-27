import { useEffect, useState, type PropsWithChildren } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createSession, type Session } from '../services/session';
import { SessionContext } from '../services/sessionContext';
export function SessionProvider({ children, value }: PropsWithChildren<{ value?: Session }>) {
  const [local] = useState(createSession);
  const session = value ?? local;
  const queryClient = useQueryClient();
  useEffect(() => session.subscribe(() => { void queryClient.cancelQueries(); queryClient.clear(); }), [session, queryClient]);
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}
