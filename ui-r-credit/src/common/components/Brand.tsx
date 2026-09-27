import { Box, Stack, Typography } from '@mui/material';
import { Link } from 'react-router';
import { locale, translations } from '../../i18n/pt-BR';

export function Brand({ contrast = false }: { contrast?: boolean }) {
  const text = translations[locale].app;
  return (
    <Stack component={Link} to="/dashboard" aria-label={text.start} direction="row" alignItems="center"
      spacing={1.5} sx={{ color: contrast ? 'inherit' : 'text.primary', textDecoration: 'none', flexShrink: 0 }}>
      <Box aria-hidden="true" sx={{ width: '2.25rem', height: '2.25rem', display: 'grid', placeItems: 'center',
        bgcolor: contrast ? 'background.paper' : 'primary.main', color: contrast ? 'primary.main' : 'primary.contrastText',
        borderRadius: 1, fontWeight: 750 }}>
        {text.brand.slice(0, 1)}
      </Box>
      <Box>
        <Typography sx={{ fontSize: '1.125rem', fontWeight: 750, lineHeight: 1.1 }}>{text.brand}</Typography>
        <Typography variant="body2" sx={{ color: contrast ? 'rgba(255,255,255,0.76)' : 'text.secondary' }}>{text.product}</Typography>
      </Box>
    </Stack>
  );
}
