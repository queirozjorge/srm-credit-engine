import { Box, Typography } from '@mui/material';
import type { z } from 'zod';
import type { totals } from '../http/contracts';
import { formatDecimal, moneyFormat } from '../format/decimal';
import { locale, translations } from '../../i18n/pt-BR';
export function FinancialTotals({ values }: { values: z.infer<typeof totals> }) {
  const text = translations[locale].financial;
  return <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(5, minmax(0, 1fr))' }, gap: 2 }}>
    {(Object.keys(text.totals) as (keyof typeof text.totals)[]).map(key => <Box key={key} sx={{ minWidth: 0 }}>
      <Typography component="dt" variant="caption" color="text.secondary">{text.totals[key]}</Typography>
      <Typography component="dd" sx={{ m: 0, overflowWrap: 'anywhere', fontWeight: 600 }}>{formatDecimal(values[key], { ...moneyFormat, allowNegative: true })}</Typography>
    </Box>)}
  </Box>;
}
