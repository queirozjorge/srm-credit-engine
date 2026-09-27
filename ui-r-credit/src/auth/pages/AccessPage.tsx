import { Box, Button, Paper, Stack, Typography } from '@mui/material';
import { Link, useLocation } from 'react-router';
import { useSession } from '../services/sessionContext';
import { SignOutButton } from '../components/SignOutButton';
import { Brand } from '../../common/components/Brand';
import { locale, translations } from '../../i18n/pt-BR';
import type { PageCopy } from '../../common/components/PageScaffold';

export function AccessPage({ copy, to = '/dashboard', action }: { copy: PageCopy; to?: string; action?: string }) {
  const text = translations[locale];
  const { identity } = useSession();
  const location = useLocation();
  return (
    <Box component="main" sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', p: { xs: 2.5, sm: 4 } }}>
      <Paper variant="outlined" sx={{ width: '100%', maxWidth: 520, p: { xs: 3, sm: 5 } }}>
        <Stack alignItems="flex-start" spacing={3}>
          <Brand />
          <Box>
            <Typography variant="overline" color="text.secondary">{copy.eyebrow}</Typography>
            <Typography component="h1" variant="h1" tabIndex={-1} sx={{ my: 1 }}>{copy.title}</Typography>
            <Typography color="text.secondary">{copy.description}</Typography>
          </Box>

          <Button component={Link} to={to} state={location.state} variant="contained">{action ?? text.auth.explore}</Button>
          {identity && <SignOutButton />}
        </Stack>
      </Paper>
    </Box>
  );
}
