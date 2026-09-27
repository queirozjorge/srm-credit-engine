import { demoMode } from '../../app/config';
import { useState, type ReactNode } from 'react';
import { Button, Chip, Paper, Stack, Typography } from '@mui/material';
import { NavigationLink } from '../../app/routes/NavigationLink';
import { FinancialTotals } from '../../common/components/FinancialTotals';
import { DataTable } from '../../common/components/DataTable';
import { formatDecimal, moneyFormat, rateFormat } from '../../common/format/decimal';
import { formatCivilDate, formatInstant } from '../../common/format/dates';
import { locale, translations } from '../../i18n/pt-BR';
import { useSimulation, type SimulationInput } from '../services/useSimulation';
import type { Simulation } from '../services/contracts';
export function SimulationPanel({ input, enabled, action, scope, expectedCount, autoStart = false }: { input: SimulationInput | null; enabled: boolean; scope?: string; expectedCount?: number; autoStart?: boolean; action?: (data: Simulation | null) => ReactNode }) {
  const text = translations[locale].pricing; const [activated, setActivated] = useState(autoStart);
  const query = useSimulation(input, enabled && (activated || autoStart), scope, expectedCount); const [pagination, setPagination] = useState({ page: 1, size: 5 });
  const data = query.data; const page = Math.min(pagination.page, Math.max(1, Math.ceil((data?.items.length ?? 0) / pagination.size)));
  return <Paper variant="outlined" sx={{ p: 2.5, minWidth: 0 }}><Stack spacing={2}>
    <Stack direction="row" useFlexGap flexWrap="wrap" justifyContent="space-between" gap={1}>
      <Typography component="h2" variant="h2">{text.title}</Typography>
      <Button disabled={!enabled || !input || query.updating} onClick={() => { setActivated(true); query.refresh(); }}>{text.refresh}</Button>
    </Stack>
    <Typography variant="body2" color="text.secondary">{text.indicative}</Typography>
    {demoMode && <Typography variant="caption" color="text.secondary">{text.demoHint}</Typography>}
    {query.updating && <Typography role="status" variant="body2">{text.updating}</Typography>}
    {data && <>
      <Chip sx={{ alignSelf: 'flex-start' }} variant="outlined" label={query.valid ? text.current : text.stale} />
      <Typography variant="body2">{text.calculated(formatInstant(data.calculatedAt), formatCivilDate(data.calculationDate), formatDecimal(data.baseRate, rateFormat))}</Typography>
      {data.exchangeRate && <Typography variant="body2">{text.exchange(formatDecimal(data.exchangeRate.rate, rateFormat), formatInstant(data.exchangeRate.validUntil))}</Typography>}
      <FinancialTotals values={data.totals} />
      <DataTable label={text.items} rows={data.items.slice((page - 1) * pagination.size, page * pagination.size)} getRowKey={row => String(row.itemIndex)} maxHeight={240}
        columns={[
          { id: 'index', label: text.item, render: row => row.itemIndex + 1 },
          { id: 'days', label: text.days, render: row => row.days.toLocaleString('pt-BR') },
          { id: 'spread', label: text.spread, render: row => formatDecimal(row.spread, rateFormat) },
          { id: 'present', label: translations[locale].financial.totals.presentValueBrl, render: row => formatDecimal(row.presentValueBrl, moneyFormat), align: 'right' },
          { id: 'payment', label: text.payment, render: row => `${row.paymentCurrency} ${formatDecimal(row.paymentValue, moneyFormat)}`, align: 'right' },
        ]} pagination={{ ...pagination, page, totalItems: data.items.length, onChange: setPagination }} />
    </>}
    <Stack direction="row" useFlexGap flexWrap="wrap" gap={1}>
      <Button component={NavigationLink} to={input && 'batchUuid' in input ? `/cambio?lote=${input.batchUuid}` : '/cambio'}>{text.goExchange}</Button>
      {action?.(query.valid ? data : null)}
    </Stack>
  </Stack></Paper>;
}
