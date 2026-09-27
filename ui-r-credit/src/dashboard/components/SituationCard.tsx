import { useId } from 'react';
import { Box, Chip, Paper, Stack, Typography } from '@mui/material';
import { formatDecimal, rateFormat } from '../../common/format/decimal';
import { locale } from '../../i18n/pt-BR';
import type { Dashboard } from '../services/contracts';

type BatchStatus = keyof Dashboard['batchCounts'];
type ExchangeStatus = Dashboard['exchange']['status'];
type SituationData = Pick<Dashboard, 'batchCounts' | 'pendingExchangeProposals' | 'exchange'>;

interface SituationCardCopy {
  title: string;
  hint: string;
  batches: string;
  pendingProposals: string;
  quote: string;
  missingQuote: string;
  batchStatuses: Record<BatchStatus, string>;
  exchangeStatuses: Record<ExchangeStatus, string>;
}

interface Props {
  data: SituationData;
  copy: SituationCardCopy;
}

const statusOrder: BatchStatus[] = ['READY', 'PENDING', 'SETTLED', 'PARTIALLY_SETTLED', 'FAILED'];

const statusColors: Record<BatchStatus, string> = {
  READY: 'text.secondary',
  PENDING: 'warning.main',
  SETTLED: 'success.main',
  PARTIALLY_SETTLED: 'warning.dark',
  FAILED: 'error.main',
};

export function SituationCard({ data, copy }: Props) {
  const titleId = useId();
  const quote = data.exchange.current
    ? formatDecimal(data.exchange.current.rate, rateFormat)
    : copy.missingQuote;

  return (
    <Paper
      component="section"
      aria-labelledby={titleId}
      variant="outlined"
      sx={{
        position: 'relative',
        minWidth: 0,
        overflow: 'hidden',
        p: { xs: 2, sm: 2.25 },
        borderRadius: 2,
        borderColor: 'divider',
        '&::before': {
          position: 'absolute',
          inset: '0 auto 0 0',
          width: 4,
          bgcolor: 'primary.main',
          content: '""',
        },
      }}
    >
      <Stack spacing={{ xs: 1.75, md: 1.5 }}>
        <Stack spacing={0.5}>
          <Typography id={titleId} component="h2" variant="h2">
            {copy.title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {copy.hint}
          </Typography>
        </Stack>

        <Box>
          <Typography variant="overline" color="text.secondary">
            {copy.batches}
          </Typography>
          <Box
            component="dl"
            sx={{
              m: 0,
              mt: 0.75,
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 0.75,
            }}
          >
            {statusOrder.map(status => (
              <Box
                key={status}
                sx={{
                  minWidth: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 1,
                  px: 1,
                  py: 0.75,
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 1.5,
                  bgcolor: 'background.default',
                }}
              >
                <Typography
                  component="dt"
                  variant="body2"
                  color="text.secondary"
                  sx={{ minWidth: 0, lineHeight: 1.35 }}
                >
                  {copy.batchStatuses[status]}
                </Typography>
                <Typography
                  component="dd"
                  sx={{ m: 0, flexShrink: 0, fontWeight: 700, color: statusColors[status] }}
                >
                  {data.batchCounts[status].toLocaleString(locale)}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>

        <Box
          sx={{
            p: 1.5,
            borderRadius: 1.5,
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
          }}
        >
          <Stack spacing={1.25}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
              <Typography variant="body2" sx={{ color: 'inherit', opacity: 0.82 }}>
                {copy.pendingProposals}
              </Typography>
              <Typography sx={{ color: 'inherit', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                {data.pendingExchangeProposals.toLocaleString(locale)}
              </Typography>
            </Stack>
            <Box sx={{ borderTop: 1, borderColor: 'rgba(255,255,255,0.24)', pt: 1 }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="caption" sx={{ display: 'block', color: 'inherit', opacity: 0.82 }}>
                    {copy.quote}
                  </Typography>
                  <Typography sx={{ color: 'inherit', fontWeight: 650, fontVariantNumeric: 'tabular-nums' }}>
                    {quote}
                  </Typography>
                </Box>
                <Chip
                  size="small"
                  variant="outlined"
                  label={copy.exchangeStatuses[data.exchange.status]}
                  sx={{
                    flexShrink: 0,
                    color: 'inherit',
                    borderColor: 'rgba(255,255,255,0.48)',
                    bgcolor: 'rgba(255,255,255,0.08)',
                  }}
                />
              </Stack>
            </Box>
          </Stack>
        </Box>
      </Stack>
    </Paper>
  );
}
