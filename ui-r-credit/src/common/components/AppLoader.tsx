import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Modal from '@mui/material/Modal';
import Fade from '@mui/material/Fade';
import useMediaQuery from '@mui/material/useMediaQuery';
import { locale, translations } from '../../i18n/pt-BR';

export function AppLoader({ open = true, onExited, disableRestoreFocus = false }: { open?: boolean; onExited?: () => void; disableRestoreFocus?: boolean }) {
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  return (
    <Modal open={open} disableRestoreFocus={disableRestoreFocus} closeAfterTransition sx={{ zIndex: (theme) => theme.zIndex.modal + 2 }}>
    <Fade in={open} onExited={onExited} timeout={reducedMotion ? 0 : 180}>
    <Box tabIndex={-1}
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
    </Fade></Modal>
  );
}
