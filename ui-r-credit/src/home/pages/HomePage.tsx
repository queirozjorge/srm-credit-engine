import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { locale, translations } from '../../i18n/pt-BR';

export function HomePage() {
  const text = translations[locale];

  return (
    <Container maxWidth="lg" sx={{ px: { xs: 3, sm: 5 } }}>
      <Stack
        component="header"
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        spacing={2}
        sx={{ py: 4, borderBottom: 1, borderColor: 'divider' }}
      >
        <Stack direction="row" alignItems="center" spacing={2}>
          <Box
            aria-hidden="true"
            sx={{ width: 6, height: 36, borderRadius: 1, bgcolor: 'primary.main' }}
          />
          <Typography sx={{ fontWeight: 750, fontSize: 24, letterSpacing: '-0.04em' }}>
            {text.app.brand}
          </Typography>
          <Typography color="text.secondary">{text.app.product}</Typography>
        </Stack>
        <Typography color="text.secondary" sx={{ alignSelf: { sm: 'center' }, fontSize: 14 }}>
          {text.app.description}
        </Typography>
      </Stack>

      <Box component="main" sx={{ py: { xs: 9, sm: 14, md: 18 }, maxWidth: 760 }}>
        <Typography variant="overline" color="text.secondary">
          {text.home.eyebrow}
        </Typography>
        <Typography
          component="h1"
          variant="h1"
          sx={{ fontSize: { xs: '2.6rem', sm: '3.6rem', md: '4.4rem' }, mt: 3, mb: 3 }}
        >
          {text.home.title}
        </Typography>
        <Typography color="text.secondary" sx={{ fontSize: { xs: 17, sm: 20 }, maxWidth: 540 }}>
          {text.home.description}
        </Typography>
        <Chip
          label={text.home.status}
          variant="outlined"
          sx={{ mt: 5, color: 'primary.main', borderColor: 'divider', bgcolor: 'background.paper' }}
        />
      </Box>
    </Container>
  );
}
