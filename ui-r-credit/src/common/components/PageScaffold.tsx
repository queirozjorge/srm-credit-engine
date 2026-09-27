import { Box, Chip, Paper, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { locale, translations } from '../../i18n/pt-BR';

export interface PageCopy {
  eyebrow: string;
  title: string;
  description: string;
}

export function PageScaffold({ copy, action, pending = true }: { copy: PageCopy; action?: ReactNode; pending?: boolean }) {
  const text = translations[locale];
  return (
    <Stack spacing={4} sx={{ minWidth: 0, flex: 1 }}>
      <Box>
        <Typography variant="overline" color="text.secondary">{copy.eyebrow}</Typography>
        <Typography component="h1" variant="h1" tabIndex={-1} sx={{ mt: 0.5, mb: 1 }}>{copy.title}</Typography>
        <Typography color="text.secondary" sx={{ maxWidth: 640 }}>{copy.description}</Typography>
      </Box>
      <Paper variant="outlined" sx={{ p: { xs: 3, md: 5 }, minHeight: 240 }}>
        <Stack alignItems="flex-start" spacing={2} sx={{ maxWidth: 520 }}>
          {pending && <>
            <Chip size="small" variant="outlined" label={text.common.preparing} />
            <Typography component="h2" variant="h2">{text.common.preparingTitle}</Typography>
            <Typography color="text.secondary">{text.common.preparingDescription}</Typography>
          </>}
          {action}
        </Stack>
      </Paper>
    </Stack>
  );
}
