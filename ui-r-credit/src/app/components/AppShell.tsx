import { useLayoutEffect, useRef, useState } from 'react';
import { Box, Button, Chip, Collapse, List, ListItemButton, Stack, Typography, useMediaQuery, useTheme } from '@mui/material';
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
  const memory = useNavigationMemory();
  const { pathname } = useLocation();
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
      memory.scroll.set(pathname, { page: window.scrollY, content: element?.scrollTop ?? 0 });
    };
  }, [memory, pathname]);

  function closeMenu() {
    setExpanded(false);
    menuButton.current?.focus({ preventScroll: true });
  }

  return (
    <Box sx={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', overflowAnchor: 'none' }}>
      <Box component="a" href="#page-content" sx={{ position: 'fixed', top: 8, left: 8, zIndex: 1500,
        transform: 'translateY(-200%)', '&:focus': { transform: 'none' }, bgcolor: 'background.paper', p: 1.5 }}>
        {text.app.skipToContent}
      </Box>
      <Box component="header" sx={{ bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider',
        px: { xs: 2, md: 3 }, py: 1.5 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" useFlexGap flexWrap="wrap" gap={2}>
          <Brand />
          <Stack direction="row" alignItems="center" useFlexGap flexWrap="wrap" gap={1}>
            <Chip variant="outlined" size="small" label={identity?.subject ?? text.app.session}  />
            <Button ref={menuButton} variant="outlined" color="inherit" aria-controls="main-navigation"
              aria-expanded={open} aria-label={open ? text.app.closeMenu : text.app.openMenu}
              onClick={() => { if (open) closeMenu(); else setExpanded(true); }}
              startIcon={<Box component="svg" aria-hidden="true" viewBox="0 0 24 24" sx={{ width: 20, height: 20 }}>
                <path d="M4 6h16M4 12h16M4 18h16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </Box>}>
              {text.app.menu}
            </Button>
            <SignOutButton />
          </Stack>
        </Stack>
      </Box>
      <Box sx={{ flex: 1, display: 'flex', minWidth: 0, flexDirection: { xs: 'column', md: 'row' } }}>
        <Collapse in={open} orientation={desktop ? 'horizontal' : 'vertical'} timeout={reducedMotion ? 0 : 200}
          style={{ width: desktop ? undefined : '100%' }}
          sx={{ flexShrink: 0, bgcolor: '#f1f4f0', '& .MuiCollapse-wrapperInner': { width: desktop ? 232 : '100%' } }}>
          <Box id="main-navigation" component="nav" aria-label={text.app.navigation} inert={!open}
            onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); closeMenu(); } }}
            sx={{ width: { xs: '100%', md: 232 }, height: '100%', p: 2, borderRight: { md: 1 },
              borderBottom: { xs: 1, md: 0 }, borderColor: { xs: 'divider', md: 'divider' } }}>
            <Typography variant="overline" color="text.secondary" sx={{ px: 1.5 }}>{text.app.operations}</Typography>
            <List disablePadding sx={{ mt: 1, display: 'grid', gap: 0.5 }}>
              {navigation.map((item) => (
                <ListItemButton key={item.to} component={NavigationLink} to={item.to}
                  onClick={() => { if (!desktop) closeMenu(); }} sx={{ fontSize: '0.875rem' }}>
                  {item.label}
                </ListItemButton>
              ))}
            </List>
          </Box>
        </Collapse>
        <Box component="main" id="page-content" ref={content} tabIndex={-1}
          sx={{ flex: 1, minWidth: 0, p: { xs: 2.5, sm: 4, lg: 5 }, display: 'flex', flexDirection: 'column' }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
