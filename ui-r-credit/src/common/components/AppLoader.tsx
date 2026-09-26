import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { locale, translations } from '../../i18n/pt-BR';

export function AppLoader() {
  return (
    <Box
      role="status"
      aria-live="polite"
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: (theme) => theme.zIndex.modal + 1,
        display: 'grid',
        placeItems: 'center',
        bgcolor: 'rgba(245, 246, 243, 0.96)',
      }}
    >
      <Stack alignItems="center" spacing={2}>
        <CircularProgress aria-hidden="true" size={36} />
        <Typography>{translations[locale].common.loading}</Typography>
      </Stack>
    </Box>
  );
}
