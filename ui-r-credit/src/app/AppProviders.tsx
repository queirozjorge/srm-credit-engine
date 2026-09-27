import { useState, type PropsWithChildren } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { createQueryClient } from '../common/http/queryClient';
import { theme } from '../common/styles/theme';
import { SessionProvider } from '../auth/components/SessionProvider';
import type { Session } from '../auth/services/session';
import { AppFeedbackProvider } from '../common/components/AppFeedbackProvider';

export function AppProviders({ children, session }: PropsWithChildren<{ session?: Session }>) {
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <SessionProvider value={session}><AppFeedbackProvider>{children}</AppFeedbackProvider></SessionProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
