import { useEffect, useState, type PropsWithChildren } from 'react';
import { useSession } from '../../auth/services/sessionContext';
import { useLocation } from 'react-router';
import { NavigationMemoryContext, type NavigationMemory } from './navigationMemory';

const rememberedPaths = new Set(['/dashboard', '/lotes', '/cedentes', '/cambio', '/extrato']);

export function NavigationMemoryProvider({ children }: PropsWithChildren) {
  const [memory] = useState<NavigationMemory>(() => ({ destinations: new Map(), scroll: new Map() }));
  const { session } = useSession();
  useEffect(() => session.subscribe(() => { memory.destinations.clear(); memory.scroll.clear(); }), [session, memory]);
  const { pathname, search } = useLocation();

  useEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    return () => { window.history.scrollRestoration = previous; };
  }, []);

  useEffect(() => {
    if (rememberedPaths.has(pathname)) memory.destinations.set(pathname, pathname + search);
  }, [memory, pathname, search]);

  return <NavigationMemoryContext.Provider value={memory}>{children}</NavigationMemoryContext.Provider>;
}
