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
      h1: { fontWeight: 600, letterSpacing: '-0.045em', lineHeight: 1.12 },
      body1: { lineHeight: 1.7 },
      overline: { fontWeight: 600, letterSpacing: '0.12em' },
    },
    shape: { borderRadius: 16 },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: { minWidth: 320 },
          '#root': { minHeight: '100dvh' },
          ':focus-visible': { outline: '3px solid #183e3b', outlineOffset: 4 },
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
    },
  },
  ptBR,
);
