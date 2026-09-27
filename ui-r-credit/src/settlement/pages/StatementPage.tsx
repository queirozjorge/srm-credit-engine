import { useRef, useState } from 'react';
import { Box, Button, Chip, IconButton, MenuItem, Paper, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { useSearchParams } from 'react-router';
import { NavigationLink } from '../../app/routes/NavigationLink';
import { DateField } from '../../common/components/DateField';
import { DataTable } from '../../common/components/DataTable';
import { TableActionIcon } from '../../common/components/TableActionButton';
import { lastSevenDays } from '../../common/format/financialCalendar';
import { formatInstant } from '../../common/format/dates';
import { formatDecimal, moneyFormat } from '../../common/format/decimal';
import { AssignorAutocomplete } from '../../register/components/AssignorAutocomplete';
import { statementErrors, statementFilters } from '../services/statementFilters';
import { useStatement } from '../services/useStatement';
import { locale, translations } from '../../i18n/pt-BR';

export function StatementPage() {
  const text = translations[locale]; const copy = text.settlement.statement; const [params, setParams] = useSearchParams(); const [defaults] = useState(lastSevenDays);
  const filters = statementFilters(params, defaults); const query = useStatement(filters);
  const signature = JSON.stringify([filters.from, filters.to, filters.assignorUuid, filters.paymentCurrency]);
  const [previous, setPrevious] = useState(signature); const [draft, setDraft] = useState(filters); const [attempted, setAttempted] = useState(false);
  if (signature !== previous) { setPrevious(signature); setDraft(filters); setAttempted(false); }
  const form = useRef<HTMLDivElement>(null); const errors = statementErrors(draft);
  const showErrors = attempted || Object.values(statementErrors(filters)).some(Boolean);
  function apply() {
    setAttempted(true); if (Object.values(errors).some(Boolean)) { setTimeout(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0); return; }
    const next = new URLSearchParams(params); Object.entries({ from: draft.from, to: draft.to, assignorUuid: draft.assignorUuid, paymentCurrency: draft.paymentCurrency }).forEach(([key, value]) => next.set(key, String(value))); next.set('page', '1'); setParams(next);
  }
  return <Stack spacing={2} sx={{ minWidth: 0, minHeight: { md: 0 }, flex: 1,
    overflowY: { xs: 'visible', md: 'hidden' } }}>
    <Box><Typography variant="overline" color="text.secondary">{copy.eyebrow}</Typography><Typography variant="h1" component="h1" tabIndex={-1}>{copy.title}</Typography><Typography color="text.secondary">{copy.description}</Typography></Box>
    <Paper variant="outlined" sx={{ p: 2 }}><Stack ref={form} spacing={1.25}>
      <Stack direction="row" useFlexGap flexWrap="wrap" gap={1.5} alignItems="center">
        <DateField label={copy.from} value={draft.from} onValueChange={from => setDraft({ ...draft, from })} error={showErrors && errors.from} helperText={showErrors && errors.from ? copy.dateInvalid : undefined} sx={{ flex: '1 1 160px', maxWidth: { sm: 210 } }} />
        <DateField label={copy.to} value={draft.to} onValueChange={to => setDraft({ ...draft, to })} error={showErrors && (errors.to || errors.range)} helperText={showErrors && (errors.to || errors.range) ? errors.to ? copy.dateInvalid : copy.rangeInvalid : undefined} sx={{ flex: '1 1 160px', maxWidth: { sm: 210 } }} />
        <TextField select slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }} label={copy.currency} value={errors.currency ? '' : draft.paymentCurrency} onChange={event => setDraft({ ...draft, paymentCurrency: event.target.value })} error={showErrors && errors.currency} helperText={showErrors && errors.currency ? copy.currencyInvalid : undefined} sx={{ flex: '1 1 160px', maxWidth: { sm: 210 } }}>
          <MenuItem value="">{copy.allCurrencies}</MenuItem>{Object.entries(text.batch.currencies).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
        </TextField>
        <AssignorAutocomplete value={draft.assignorUuid}
          onChange={assignorUuid => setDraft(current => ({ ...current, assignorUuid }))}
          activeOnly={false} allLabel={copy.selectAllAssignors} label={copy.assignor} placeholder={copy.filterAssignors}
          error={showErrors && errors.assignor} helperText={showErrors && errors.assignor ? copy.assignorInvalid : undefined}
          sx={{ flex: '1 1 220px', minWidth: 0, maxWidth: { sm: 280 } }} />
        <Button onClick={apply} variant="contained" disabled={query.isFetching}>{copy.apply}</Button>
      </Stack>
      <Typography variant="caption" color="text.secondary">{copy.dateHint}</Typography>
    </Stack></Paper>
    <Stack spacing={{ xs: 1.5, md: 0.75 }} sx={{ minWidth: 0, minHeight: { md: 0 }, flex: 1, overflow: { xs: 'visible', md: 'hidden' } }}>
      <Stack direction="row" useFlexGap flexWrap="wrap" justifyContent="flex-start" alignItems="center" gap={0.5}>
        <Typography variant="body2" color="text.secondary">{query.data ? copy.resultCount(query.data.totalItems) : copy.table}</Typography>
        {query.data && query.outdated && <Chip label={copy.stale} variant="outlined" />}
      </Stack>
      {query.data && <DataTable label={copy.table} rows={query.data.items} getRowKey={row => row.uuid} emptyMessage={copy.empty} fillHeight columns={[
      { id: 'date', label: copy.settledAt, render: row => formatInstant(row.settledAt) },
      { id: 'assignor', label: copy.assignor, render: row => row.assignorName },
      { id: 'ref', label: text.batch.reference, render: row => row.externalReference },
      { id: 'face', label: text.batch.faceValue, render: row => formatDecimal(row.faceValueBrl, moneyFormat), align: 'right' },
      { id: 'present', label: copy.present, render: row => formatDecimal(row.presentValueBrl, moneyFormat), align: 'right' },
      { id: 'paid', label: copy.payment, render: row => `${row.paymentCurrency} ${formatDecimal(row.paymentValue, moneyFormat)}`, align: 'right' },
      { id: 'batch', label: copy.batch, align: 'center', render: row => <Tooltip title={text.batch.view}>
        <IconButton component={NavigationLink} to={`/lotes/${row.batchUuid}`} aria-label={text.batch.view}
          sx={{ width: 36, height: 36, color: 'primary.main' }}><TableActionIcon name="view" /></IconButton>
      </Tooltip> },
      ]} pagination={{ pageSizes: [20, 50, 100], page: filters.page, size: filters.size, totalItems: query.data.totalItems, disabled: query.isFetching,
      onChange: next => setParams(current => { const updated = new URLSearchParams(current); updated.set('page', String(next.page)); updated.set('size', String(next.size)); return updated; }) }} />}
    </Stack>
  </Stack>;
}
