import { Box, Chip, MenuItem, Paper, Stack, Tab, Tabs, TextField, Typography } from '@mui/material';
import { useSearchParams } from 'react-router';
import { FinancialTotals } from '../../common/components/FinancialTotals';
import { RefreshButton } from '../../common/components/RefreshButton';
import { formatInstant } from '../../common/format/dates';
import { period } from '../services/contracts';
import { useDashboard } from '../services/useDashboard';
import { PaymentsChart } from '../components/PaymentsChart';
import { SituationCard } from '../components/SituationCard';
import { locale, translations } from '../../i18n/pt-BR';
export function DashboardPage() {
  const text = translations[locale]; const copy = text.dashboard; const [params, setParams] = useSearchParams();
  const selected = period.safeParse(params.get('period')); const selectedPeriod = selected.success ? selected.data : 'LAST_7_DAYS';
  const currency = params.get('currency') === 'USD' ? 'USD' : 'BRL'; const query = useDashboard(selectedPeriod); const data = query.data;
  function update(key: string, value: string) { setParams(old => { const next = new URLSearchParams(old); next.set(key, value); return next; }); }
  return <Stack spacing={{ xs: 2, md: 1.5 }} sx={{ minWidth: 0, minHeight: 0, flex: 1 }}>
    <Stack direction="row" useFlexGap flexWrap="wrap" justifyContent="space-between" alignItems="flex-start" gap={2} sx={{ flexShrink: 0 }}>
      <Box><Typography variant="overline" color="text.secondary">{copy.eyebrow}</Typography><Typography variant="h1" component="h1" tabIndex={-1}>{copy.title}</Typography><Typography color="text.secondary">{copy.description}</Typography></Box>
    </Stack>
    <Stack direction="row" useFlexGap flexWrap="wrap" gap={1.5} alignItems="center" sx={{ flexShrink: 0 }}>
      <TextField select label={copy.period} value={selectedPeriod} sx={{ minWidth: 240 }} disabled={query.isFetching} onChange={event => update('period', event.target.value)}>
        {Object.entries(copy.periods).map(([value, label]) => <MenuItem value={value} key={value}>{label}</MenuItem>)}
      </TextField>
      <RefreshButton label={copy.refresh} disabled={query.isFetching} onClick={() => { void query.refetch(); }} />
      {data && query.outdated && <Chip label={copy.stale} variant="outlined" />}
    </Stack>
    {data && <>
      <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.25 }, flexShrink: 0 }}><Stack spacing={{ xs: 1.25, md: 1 }}>
        <Typography component="h2" variant="h2">{copy.totals}</Typography>
        <Typography variant="body2" color="text.secondary">{copy.range(formatInstant(data.period.start), formatInstant(data.period.end))}</Typography>
        <FinancialTotals values={data.totals} />
      </Stack></Paper>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1.6fr) minmax(300px, 1fr)' }, gap: { xs: 1.5, md: 2 }, flex: 1, minHeight: 0, alignItems: 'stretch' }}>
        <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.25 }, minWidth: 0, minHeight: 0 }}><Stack spacing={{ xs: 1.25, md: 1 }} sx={{ minHeight: 0, height: { lg: '100%' } }}>
          <Typography component="h2" variant="h2">{copy.chart}</Typography>
          <Tabs value={currency} aria-label={copy.currency} onChange={(_, value: string) => update('currency', value)}>
            <Tab value="BRL" label={copy.currencies.BRL} /><Tab value="USD" label={copy.currencies.USD} />
          </Tabs><PaymentsChart rows={data.dailyPayments} currency={currency} />
        </Stack></Paper>
        <SituationCard data={data} copy={{ title: copy.global, hint: copy.globalHint, batches: copy.batchCounts,
          pendingProposals: copy.pendingProposals, quote: copy.quote, missingQuote: text.exchange.quoteStatuses.ABSENT,
          batchStatuses: text.batch.statuses, exchangeStatuses: text.exchange.quoteStatuses }} />
      </Box>
    </>}
  </Stack>;
}
