import { createTheme } from '@mui/material/styles';
import { ptBR } from '@mui/material/locale';

export const theme = createTheme(
  {
    palette: {
      mode: 'light',
      primary: { main: '#183e3b' },
      background: { default: '#f5f6f3', paper: '#ffffff' },
      text: { primary: '#1d302e', secondary: '#596763' },
      divider: '#dce2dc',
    },
    typography: {
      fontFamily: '"Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
      h1: { fontSize: '2rem', fontWeight: 650, letterSpacing: '-0.035em', lineHeight: 1.2 },
      h2: { fontSize: '1.25rem', fontWeight: 600, letterSpacing: '-0.02em' },
      body1: { fontSize: '0.9375rem', lineHeight: 1.65 },
      body2: { fontSize: '0.8125rem', lineHeight: 1.6 },
      button: { textTransform: 'none', fontWeight: 600 },
      overline: { fontSize: '0.6875rem', fontWeight: 650, letterSpacing: '0.12em' },
    },
    shape: { borderRadius: 8 },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: { minWidth: 320, margin: 0 },
          '#root': { minHeight: '100dvh' },
          ':focus-visible': { outline: '3px solid #183e3b', outlineOffset: 4 },
          'h1[tabindex="-1"]:focus': { outline: 'none' },
          '@media (prefers-reduced-motion: reduce)': {
            '*, *::before, *::after': {
              animationDuration: '0.01ms !important',
              animationIterationCount: '1 !important',
              transitionDuration: '0.01ms !important',
              scrollBehavior: 'auto !important',
            },
          },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: { root: { minHeight: 44, paddingInline: 16 } },
      },
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiChip: { styleOverrides: {
        root: { fontWeight: 500, height: 'auto', minHeight: 24 },
        label: { whiteSpace: 'normal', paddingTop: 2, paddingBottom: 2 },
      } },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 6,
            minHeight: 44,
            '&[aria-current="page"]': { backgroundColor: '#e5ece7', color: '#183e3b', fontWeight: 650 },
          },
        },
      },
    },
  },
  ptBR,
);
