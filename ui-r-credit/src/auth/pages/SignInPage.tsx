import { useRef, useState } from 'react';
import { useAppFeedback } from '../../common/components/feedbackContext';
import { Box, Button, Paper, Stack, Typography } from '@mui/material';
import { useLocation } from 'react-router';
import { Brand } from '../../common/components/Brand';
import { locale, translations } from '../../i18n/pt-BR';
import { safeReturnTo } from '../services/returnTo';
import { useSession } from '../services/sessionContext';
export function SignInPage() {
  const text = translations[locale];
  const { beginLoading, showWarning } = useAppFeedback(); const sending = useRef(false); const [pending, setPending] = useState(false);
  const { session } = useSession(); const location = useLocation();
  const state: unknown = location.state;
  const destination = safeReturnTo(state && typeof state === 'object' && 'returnTo' in state ? state.returnTo : undefined);
  return <Box component="main" sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', p: 2.5 }}>
    <Paper variant="outlined" sx={{ width: '100%', maxWidth: 520, p: { xs: 3, sm: 5 } }}>
      <Stack spacing={3} alignItems="flex-start">
        <Brand /><Typography component="h1" variant="h1" tabIndex={-1}>{text.auth.signIn.title}</Typography>
        <Typography color="text.secondary">{text.auth.loginDescription}</Typography>
        <Button variant="contained" disabled={pending} onClick={() => {
          if (sending.current) return; sending.current = true; setPending(true); const end = beginLoading();
          void session.login(destination).catch(() => { showWarning({ message: text.auth.failed }); end(); sending.current = false; setPending(false); });
        }}>{text.auth.login}</Button>
      </Stack>
    </Paper>
  </Box>;
}
