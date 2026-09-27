import { NewBatchPage } from './NewBatchPage';
import { useSession } from '../../auth/services/sessionContext';
import { can } from '../../auth/services/session';
import { useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { useNavigationMemory } from '../../app/routes/navigationMemory';
import { BatchesPage } from './BatchesPage';
export function BatchWorkspace() {
  const { pathname, search } = useLocation(); const memory = useNavigationMemory();
  const active = pathname === '/lotes' || pathname === '/lotes/';
  const [listSearch, setListSearch] = useState(active ? search : (memory.destinations.get('/lotes')?.split('?')[1] ?? ''));
  if (active && search !== listSearch) setListSearch(search);
  const creating = pathname === '/lotes/novo'; const [visited, setVisited] = useState(creating);
  if (creating && !visited) setVisited(true);
  const { identity } = useSession();
  return <><BatchesPage active={active} searchParams={listSearch} />{visited && can(identity, 'batchWrite') && <NewBatchPage active={creating} />}<Outlet /></>;
}
