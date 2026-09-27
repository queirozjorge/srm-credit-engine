import { Navigate, Outlet, useLocation } from 'react-router';
import { useSession } from '../../auth/services/sessionContext';
import { can, type Permission } from '../../auth/services/session';
export function RequireSession({ permission = 'read' }: { permission?: Permission }) {
  const { identity, expired } = useSession();
  const location = useLocation();
  if (!identity) return <Navigate to={expired ? '/sessao-expirada' : '/entrar'} replace state={{ returnTo: location.pathname + location.search }} />;
  if (!can(identity, permission)) return <Navigate to="/acesso-negado" replace />;
  return <Outlet />;
}
