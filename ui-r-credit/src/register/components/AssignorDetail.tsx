import { Box, Chip, Paper, Stack, Typography } from '@mui/material';
import { locale, translations } from '../../i18n/pt-BR';
import { formatCnpj } from '../../common/format/document';
import { formatInstant } from '../../common/format/dates';
import type { Assignor } from '../services/contracts';
export function AssignorDetail({ row }: { row: Assignor }) {
  const text = translations[locale].register;
  const entries = [[text.name, row.name], [text.document, formatCnpj(row.documentNumber)], [text.identifier, row.uuid],
    [text.registeredAt, formatInstant(row.registeredAt)], [text.updatedAt, row.updatedAt ? formatInstant(row.updatedAt) : text.notUpdated]];
  return <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 4 } }}>
    <Stack spacing={3}>
      <Box><Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{text.status}</Typography>
        <Chip label={row.deleted ? text.inactive : text.active} variant="outlined" color={row.deleted ? 'default' : 'primary'} /></Box>
      <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 3 }}>
        {entries.map(([label, value]) => <Box key={label}>
          <Typography component="dt" variant="body2" color="text.secondary">{label}</Typography>
          <Typography component="dd" sx={{ m: 0, mt: 0.5, overflowWrap: 'anywhere', fontWeight: 500 }}>{value}</Typography>
        </Box>)}
      </Box>
    </Stack>
  </Paper>;
}
