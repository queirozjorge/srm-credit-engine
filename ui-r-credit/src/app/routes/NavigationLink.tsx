import { NavLink, useLocation, useNavigate, type NavLinkProps } from 'react-router';
import { useNavigationMemory } from './navigationMemory';

export function NavigationLink({ to, onClick, ...props }: NavLinkProps & { to: string }) {
  const memory = useNavigationMemory();
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <NavLink {...props} to={to} onClick={(event) => {
      onClick?.(event);
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey
        || event.shiftKey || event.altKey || (props.target && props.target !== '_self')) return;
      event.preventDefault();
      const destination = memory.destinations.get(to) ?? to;
      if (destination !== location.pathname + location.search) navigate(destination);
    }} />
  );
}
