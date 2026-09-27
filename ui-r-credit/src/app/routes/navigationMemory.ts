import { createContext, useContext } from 'react';

export interface NavigationMemory {
  destinations: Map<string, string>;
  scroll: Map<string, { page: number; content: number }>;
}

export const NavigationMemoryContext = createContext<NavigationMemory | null>(null);

export function useNavigationMemory() {
  const memory = useContext(NavigationMemoryContext);
  if (!memory) throw new Error('Contexto de navegação indisponível.');
  return memory;
}
