import { Box, Button, Chip, Paper, Stack, Typography } from '@mui/material';
import { useLocation, useNavigate } from 'react-router';
import { Brand } from '../../src/common/components/Brand';
import { locale, translations } from '../pt-BR';
import { safeReturnTo } from '../../src/auth/services/returnTo';
import { useSession } from '../../src/auth/services/sessionContext';
import { demoProfiles } from '../auth/mocks/profiles';
export function SignInPage() {
  const text = translations[locale];
  const { session } = useSession(); const navigate = useNavigate(); const location = useLocation();
  const state: unknown = location.state;
  const destination = safeReturnTo(state && typeof state === 'object' && 'returnTo' in state ? state.returnTo : undefined);
  return <Box component="main" sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', p: 2.5 }}>
    <Paper variant="outlined" sx={{ width: '100%', maxWidth: 520, p: { xs: 3, sm: 5 } }}>
      <Stack spacing={3} alignItems="flex-start">
        <Brand /><Typography component="h1" variant="h1" tabIndex={-1}>{text.auth.signIn.title}</Typography>
        <Typography color="text.secondary">{text.demo.description}</Typography>
        <><Chip label={text.demo.label} variant="outlined" />
          <Stack spacing={1.5} sx={{ width: '100%' }}>{(['operator', 'manager', 'combined'] as const).map(profile =>
            <Button key={profile} variant={profile === 'operator' ? 'contained' : 'outlined'} onClick={() => {
              session.signIn(demoProfiles[profile], demoProfiles[profile].subject); navigate(destination, { replace: true });
            }}>{text.demo[profile]}</Button>)}</Stack></>
      </Stack>
    </Paper>
  </Box>;
}
