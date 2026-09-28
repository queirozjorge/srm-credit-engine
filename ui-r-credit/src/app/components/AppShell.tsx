import { useLayoutEffect, useRef, useState } from 'react';
import { Box, Chip, IconButton, List, ListItemButton, Stack, Tooltip, Typography, useMediaQuery, useTheme } from '@mui/material';
import { Outlet, useLocation } from 'react-router';
import { locale, translations } from '../../i18n/pt-BR';
import { NavigationLink } from '../routes/NavigationLink';
import { useNavigationMemory } from '../routes/navigationMemory';
import { useSession } from '../../auth/services/sessionContext';
import { SignOutButton } from '../../auth/components/SignOutButton';
import { Brand } from '../../common/components/Brand';

export function AppShell() {
  const text = translations[locale];
  const { identity } = useSession();
  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up('md'));
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [expanded, setExpanded] = useState<boolean | null>(null);
  const open = expanded ?? desktop;
  const menuButton = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLElement>(null);
  const navigationChange = useRef(false);
  const memory = useNavigationMemory();
  const { pathname, search } = useLocation();
  const navigation = [
    { to: '/dashboard', label: text.dashboard.title },
    { to: '/lotes', label: text.batch.list.title },
    { to: '/cedentes', label: text.register.title },
    { to: '/cambio', label: text.exchange.title },
    { to: '/extrato', label: text.settlement.statement.title },
  ];

  useLayoutEffect(() => {
    const element = content.current;
    const saved = memory.scroll.get(pathname);
    element?.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
    if (element) element.scrollTop = saved?.content ?? 0;
    window.scrollTo({ top: saved?.page ?? 0, behavior: 'instant' });
    return () => {
      if (!navigationChange.current) memory.scroll.set(pathname, { page: window.scrollY, content: element?.scrollTop ?? 0 });
      navigationChange.current = false;
    };
  }, [memory, pathname]);

  function closeMenu() {
    setExpanded(false);
    menuButton.current?.focus({ preventScroll: true });
  }

  return (
    <Box sx={{ minHeight: '100dvh', height: { md: '100dvh' }, display: 'flex', flexDirection: 'column',
      overflow: { md: 'hidden' }, overflowAnchor: 'none' }}>
      <Box component="a" href="#page-content" sx={{ position: 'fixed', top: 8, left: 8, zIndex: 1500,
        transform: 'translateY(-200%)', '&:focus': { transform: 'none' }, bgcolor: 'background.paper', p: 1.5 }}>
        {text.app.skipToContent}
      </Box>
      <Box component="header" sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', borderBottom: 1,
        borderColor: 'rgba(255,255,255,0.18)',
        px: { xs: 2, md: 3 }, py: 0.5 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" useFlexGap flexWrap="wrap" gap={2}>
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <IconButton ref={menuButton} color="inherit" aria-controls="main-navigation"
              aria-expanded={open} aria-label={open ? text.app.closeMenu : text.app.openMenu}
              onClick={() => { if (open) closeMenu(); else setExpanded(true); }}
              sx={{ width: 48, height: 48, ml: { xs: -0.5, md: -1.5 }, color: 'inherit', borderRadius: 1.5,
                '&:hover': { bgcolor: 'rgba(255,255,255,0.12)' } }}>
              <Box component="svg" aria-hidden="true" viewBox="0 0 24 24" sx={{ width: 30, height: 30 }}>
                <path d="M4.5 7h15M4.5 12h10M4.5 17h15" fill="none" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" />
                <path d={open ? 'm19 9-3 3 3 3' : 'm16 9 3 3-3 3'} fill="none" stroke="currentColor" strokeWidth="1.8"
                  strokeLinecap="round" strokeLinejoin="round" />
              </Box>
            </IconButton>
            <Brand contrast />
          </Stack>
          <Stack direction="row" alignItems="center" useFlexGap flexWrap="wrap" gap={1}>
            <Chip variant="outlined" size="small" label={identity?.displayName ?? (identity ? text.app.authenticatedUser : text.app.session)}
              sx={{ color: 'inherit', borderColor: 'rgba(255,255,255,0.55)' }} />
            <Box sx={{ '& .MuiButton-root': { color: 'inherit', borderColor: 'rgba(255,255,255,0.55)',
              '&:hover': { bgcolor: 'rgba(255,255,255,0.12)', borderColor: '#fff' } } }}>
              <SignOutButton />
            </Box>
          </Stack>
        </Stack>
      </Box>
      <Box sx={{ flex: 1, display: 'flex', minWidth: 0, minHeight: 0, flexDirection: { xs: 'column', md: 'row' } }}>
        <Box component="aside" sx={{ flexShrink: 0, overflow: 'hidden', bgcolor: 'primary.main',
          width: { xs: '100%', md: open ? 232 : 72 },
          maxHeight: { xs: open ? '100dvh' : 0, md: 'none' },
          transition: reducedMotion ? 'none' : 'width 200ms ease, max-height 200ms ease' }}>
          <Box id="main-navigation" component="nav" aria-label={text.app.navigation} inert={!desktop && !open}
            onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); closeMenu(); } }}
            sx={{ width: { xs: '100%', md: open ? 232 : 72 }, height: { xs: 'auto', md: '100%' }, p: open ? 2 : 1,
              borderRight: { md: 1 }, borderBottom: { xs: open ? 1 : 0, md: 0 }, borderColor: 'rgba(255,255,255,0.2)',
              transition: reducedMotion ? 'none' : 'width 200ms ease, padding 200ms ease' }}>
            {open && <Typography variant="overline" sx={{ px: 1.5, color: 'rgba(255,255,255,0.68)' }}>{text.app.operations}</Typography>}
            <List disablePadding sx={{ mt: open ? 1 : 0, display: 'grid', gap: 0.5 }}>
              {navigation.map((item) => (
                <Tooltip key={item.to} title={!open && desktop ? item.label : ''} placement="right" enterDelay={400}>
                  <ListItemButton component={NavigationLink} to={item.to} aria-label={item.label}
                    onClick={event => {
                      if (!desktop) {
                        memory.scroll.set(pathname, { page: window.scrollY, content: content.current?.scrollTop ?? 0 });
                        const destination = memory.destinations.get(item.to) ?? item.to;
                        const followsNavigation = event.button === 0 && !event.defaultPrevented && !event.metaKey
                          && !event.ctrlKey && !event.shiftKey && !event.altKey
                          && (!event.currentTarget.getAttribute('target') || event.currentTarget.getAttribute('target') === '_self');
                        navigationChange.current = followsNavigation && destination !== `${pathname}${search}`;
                        closeMenu();
                      }
                    }}
                    sx={{ minHeight: 44, px: open ? 1.5 : 1, justifyContent: open ? 'flex-start' : 'center',
                      gap: open ? 1.5 : 0, borderRadius: 1, fontSize: '0.875rem', whiteSpace: 'nowrap', color: 'rgba(255,255,255,0.88)',
                      '&.active, &[aria-current="page"]': { bgcolor: 'rgba(255,255,255,0.16)', color: '#ffffff', fontWeight: 650 },
                      '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}>
                    <NavigationIcon to={item.to} />
                    <Box component="span" aria-hidden={!open} sx={{ overflow: 'hidden', maxWidth: open ? 180 : 0,
                      opacity: open ? 1 : 0, transition: reducedMotion ? 'none' : 'max-width 200ms ease, opacity 150ms ease' }}>
                      {item.label}
                    </Box>
                  </ListItemButton>
                </Tooltip>
              ))}
            </List>
          </Box>
        </Box>
        <Box component="main" id="page-content" ref={content} tabIndex={-1}
          sx={{ flex: 1, minWidth: 0, minHeight: 0, p: { xs: 2.5, sm: 4, lg: 5 }, display: 'flex', flexDirection: 'column',
            overflowY: pathname === '/lotes' ? { xs: 'visible', md: 'hidden' } : 'auto' }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}

function NavigationIcon({ to }: { to: string }) {
  const props = { component: 'svg' as const, viewBox: '0 0 24 24', 'aria-hidden': true,
    sx: { width: 22, height: 22, flexShrink: 0, fill: 'none', stroke: 'currentColor', strokeWidth: 1.7,
      strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const } };

  switch (to) {
    case '/dashboard':
      return <Box {...props}><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" /></Box>;
    case '/lotes':
      return <Box {...props}><path d="M5 7.5h12.5a2 2 0 0 1 2 2v9H7a2 2 0 0 1-2-2z" /><path d="M5 7.5V5.8a1.8 1.8 0 0 1 1.8-1.8H18M8 11h8M8 14.5h6" /></Box>;
    case '/cedentes':
      return <Box {...props}><circle cx="9" cy="8" r="3" /><path d="M3.5 20v-1.2A5.5 5.5 0 0 1 9 13.3a5.5 5.5 0 0 1 5.5 5.5V20zM16 5.5a3 3 0 0 1 0 5.8M17 13.5a5.2 5.2 0 0 1 3.5 5v1.2" /></Box>;
    case '/cambio':
      return <Box {...props}><path d="M4 8h14l-3-3M20 16H6l3 3" /><path d="M18 8a6 6 0 0 1 1 8M6 16a6 6 0 0 1-1-8" /></Box>;
    default:
      return <Box {...props}><path d="M6 3.5h9l3 3V20H6z" /><path d="M15 3.5V7h3M9 11h6M9 14h6M9 17h4" /></Box>;
  }
}
