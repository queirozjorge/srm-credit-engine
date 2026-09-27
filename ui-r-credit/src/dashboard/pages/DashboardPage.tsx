import { Box, Button, Chip, MenuItem, Paper, Stack, Tab, Tabs, TextField, Typography } from '@mui/material';
import { useSearchParams } from 'react-router';
import { NavigationLink } from '../../app/routes/NavigationLink';
import { useSession } from '../../auth/services/sessionContext';
import { can } from '../../auth/services/session';
import { FinancialTotals } from '../../common/components/FinancialTotals';
import { formatInstant } from '../../common/format/dates';
import { formatDecimal, rateFormat } from '../../common/format/decimal';
import { period } from '../services/contracts';
import { useDashboard } from '../services/useDashboard';
import { PaymentsChart } from '../components/PaymentsChart';
import { locale, translations } from '../../i18n/pt-BR';
export function DashboardPage() {
  const text = translations[locale]; const copy = text.dashboard; const { identity } = useSession(); const [params, setParams] = useSearchParams();
  const selected = period.safeParse(params.get('period')); const selectedPeriod = selected.success ? selected.data : 'LAST_7_DAYS';
  const currency = params.get('currency') === 'USD' ? 'USD' : 'BRL'; const query = useDashboard(selectedPeriod); const data = query.data;
  function update(key: string, value: string) { setParams(old => { const next = new URLSearchParams(old); next.set(key, value); return next; }); }
  return <Stack spacing={2.5} sx={{ minWidth: 0, flex: 1 }}>
    <Stack direction="row" useFlexGap flexWrap="wrap" justifyContent="space-between" alignItems="flex-start" gap={2}>
      <Box><Typography variant="overline" color="text.secondary">{copy.eyebrow}</Typography><Typography variant="h1" component="h1" tabIndex={-1}>{copy.title}</Typography><Typography color="text.secondary">{copy.description}</Typography></Box>
      {can(identity, 'batchWrite') && <Button component={NavigationLink} to="/lotes/novo" variant="contained">{text.batch.create.title}</Button>}
    </Stack>
    <Stack direction="row" useFlexGap flexWrap="wrap" gap={1.5} alignItems="center">
      <TextField select label={copy.period} value={selectedPeriod} sx={{ minWidth: 240 }} disabled={query.isFetching} onChange={event => update('period', event.target.value)}>
        {Object.entries(copy.periods).map(([value, label]) => <MenuItem value={value} key={value}>{label}</MenuItem>)}
      </TextField><Button disabled={query.isFetching} onClick={() => { void query.refetch(); }}>{copy.refresh}</Button>
      {data && query.outdated && <Chip label={copy.stale} variant="outlined" />}
    </Stack>
    {data && <>
      <Paper variant="outlined" sx={{ p: 2.5 }}><Stack spacing={1.5}>
        <Typography component="h2" variant="h2">{copy.totals}</Typography>
        <Typography variant="body2" color="text.secondary">{copy.range(formatInstant(data.period.start), formatInstant(data.period.end))}</Typography>
        <FinancialTotals values={data.totals} />
      </Stack></Paper>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1.7fr) minmax(280px, 1fr)' }, gap: 2 }}>
        <Paper variant="outlined" sx={{ p: 2.5, minWidth: 0 }}><Stack spacing={1.5}>
          <Typography component="h2" variant="h2">{copy.chart}</Typography>
          <Tabs value={currency} aria-label={copy.currency} onChange={(_, value: string) => update('currency', value)}>
            <Tab value="BRL" label={copy.currencies.BRL} /><Tab value="USD" label={copy.currencies.USD} />
          </Tabs><PaymentsChart rows={data.dailyPayments} currency={currency} />
        </Stack></Paper>
        <Paper variant="outlined" sx={{ p: 2.5, minWidth: 0 }}><Stack spacing={1.5}>
          <Typography component="h2" variant="h2">{copy.global}</Typography><Typography variant="body2" color="text.secondary">{copy.globalHint}</Typography>
          <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: '1fr auto', gap: 1 }}>
            {Object.entries(data.batchCounts).map(([status, count]) => <Box key={status} sx={{ display: 'contents' }}><Typography component="dt">{text.batch.statuses[status as keyof typeof data.batchCounts]}</Typography><Typography component="dd" sx={{ m: 0, fontWeight: 600 }}>{count.toLocaleString(locale)}</Typography></Box>)}
          </Box>
          <Typography variant="body2">{copy.pendingProposals}: {data.pendingExchangeProposals.toLocaleString(locale)}</Typography>
          <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{copy.quote}: {data.exchange.current ? formatDecimal(data.exchange.current.rate, rateFormat) : text.exchange.quoteStatuses.ABSENT}</Typography>
          <Chip sx={{ alignSelf: 'flex-start' }} variant="outlined" label={text.exchange.quoteStatuses[data.exchange.status]} />
          <Stack direction="row" gap={1} useFlexGap flexWrap="wrap">
            <Button component={NavigationLink} to="/lotes">{text.batch.list.title}</Button><Button component={NavigationLink} to="/cambio">{text.exchange.title}</Button><Button component={NavigationLink} to="/extrato">{text.settlement.statement.title}</Button>
          </Stack>
        </Stack></Paper>
      </Box><Typography variant="caption" color="text.secondary">{copy.generated(formatInstant(data.generatedAt))}</Typography>
    </>}
  </Stack>;
}
