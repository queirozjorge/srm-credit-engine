import { useRef, useState } from 'react';
import { Box, Button, Chip, MenuItem, Paper, Stack, Tab, Tabs, TextField, Typography } from '@mui/material';
import { Link, useSearchParams } from 'react-router';
import { useSession } from '../../auth/services/sessionContext';
import { actorDisplayName, can } from '../../auth/services/session';
import { uuid } from '../../common/http/contracts';
import { DataTable } from '../../common/components/DataTable';
import { RefreshButton } from '../../common/components/RefreshButton';
import { TableActionButton } from '../../common/components/TableActionButton';
import { formatDecimal, rateFormat } from '../../common/format/decimal';
import { formatInstant } from '../../common/format/dates';
import { locale, translations } from '../../i18n/pt-BR';
import { exchangeFilters } from '../services/validation';
import { useExchange } from '../services/useExchange';
import type { ExchangeProposal } from '../services/contracts';
import { ProposalDialog } from '../components/ProposalDialog';
export function ExchangePage() {
  const text = translations[locale].exchange; const [params, setParams] = useSearchParams(); const filters = exchangeFilters(params);
  const { identity } = useSession(); const { view, reference, refresh } = useExchange(filters);
  const [dialog, setDialog] = useState<{ proposal: ExchangeProposal | null; base: string | null } | null>(null); const [open, setOpen] = useState(false);
  const dialogClosing = useRef(false);
  const data = view.data; const origin = uuid.safeParse(params.get('lote')); const source = origin.success ? origin.data : null;
  const requestedTab = params.get('tab');
  const activeTab = requestedTab === 'proposals' || requestedTab === 'quotes' ? requestedTab : 'actual';
  function update(next: Record<string, string | undefined>) { setParams(current => { const result = new URLSearchParams(current); Object.entries(next).forEach(([key, value]) => { if (value) result.set(key, value); else result.delete(key); }); return result; }); }
  function selectTab(next: 'actual' | 'proposals' | 'quotes') {
    update({ tab: next, history: next === 'quotes' ? 'quotes' : next === 'proposals' ? 'proposals' : undefined,
      status: undefined, page: '1' });
  }
  function show(proposal: ExchangeProposal | null) {
    if (dialog || dialogClosing.current) return;
    setDialog({ proposal, base: data?.current?.rate ?? null }); setOpen(true);
  }
  function closeDialog() { dialogClosing.current = true; setOpen(false); }
  function finishDialog() { setDialog(null); setOpen(false); dialogClosing.current = false; }
  const pagination = { page: filters.page, size: filters.size, totalItems: data?.history.page.totalItems ?? 0, disabled: view.isFetching,
    onChange: (next: { page: number; size: number }) => update({ page: String(next.page), size: String(next.size) }) };
  return <Stack spacing={2} sx={{ minWidth: 0, minHeight: { md: 0 }, flex: 1,
    overflowY: { xs: 'visible', md: 'hidden' } }}>
    <Stack direction="row" alignItems="flex-start" justifyContent="space-between" useFlexGap flexWrap="wrap" gap={2}>
      <Box><Typography variant="overline" color="text.secondary">{text.eyebrow}</Typography><Typography variant="h1" component="h1" tabIndex={-1}>{text.title}</Typography><Typography color="text.secondary">{text.description}</Typography></Box>
      <Stack direction="row" alignItems="center" useFlexGap flexWrap="wrap" gap={1}>
        <RefreshButton label={text.refresh} disabled={view.isFetching || reference.isFetching} onClick={() => { void Promise.all([refresh(), reference.refetch()]).catch(() => {}); }} />
        {can(identity, 'propose') && <Button variant="contained" onClick={() => show(null)}>{text.propose}</Button>}
      </Stack>
    </Stack>
    {source && <Button component={Link} to={`/lotes/${source}${can(identity, 'simulate') ? '?tab=requests' : ''}`} state={can(identity, 'simulate') ? { simulate: true } : undefined} sx={{ alignSelf: 'flex-start' }}>{can(identity, 'simulate') ? text.backSimulate : text.back}</Button>}
    <Tabs value={activeTab} aria-label={text.history} variant="scrollable" onChange={(_, value: 'actual' | 'quotes' | 'proposals') => selectTab(value)}>
      <Tab value="actual" label={text.actualTab} />
      <Tab value="proposals" label={text.proposals} />
      <Tab value="quotes" label={text.quotes} />
    </Tabs>
    {activeTab === 'actual' && <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
      <Paper variant="outlined" sx={{ p: 2.5, minWidth: 0, overflowWrap: 'anywhere' }}><Stack spacing={1.5}>
        <Typography component="h2" variant="h2">{text.current}</Typography>
        {data && <><Chip label={text.quoteStatuses[data.currentStatus]} sx={{ alignSelf: 'flex-start' }} variant="outlined" />
          {data.current && <><Typography variant="h1" component="p">{formatDecimal(data.current.rate, rateFormat)} <Typography component="span" variant="body2">{text.rate}</Typography></Typography>
            <Typography variant="body2">{text.effective}: {formatInstant(data.current.effectiveFrom)}</Typography><Typography variant="body2">{text.until}: {formatInstant(data.current.validUntil)}</Typography></>}
          <Typography variant="caption">{text.evaluated(formatInstant(data.evaluatedAt))}</Typography></>}
        <Typography variant="body2" color="text.secondary">{text.validity}</Typography>
      </Stack></Paper>
      <Paper variant="outlined" sx={{ p: 2.5, minWidth: 0, overflowWrap: 'anywhere' }}><Stack spacing={1.5}>
        <Typography component="h2" variant="h2">{text.reference}</Typography>
        {reference.data && <><Typography variant="h1" component="p">{formatDecimal(reference.data.rate, rateFormat)} <Typography component="span" variant="body2">{text.rate}</Typography></Typography>
          <Typography variant="body2">{text.observed}: {formatInstant(reference.data.observedAt)}</Typography></>}
        {reference.isError && <Typography variant="caption">{reference.data ? text.staleReference : text.unavailable}</Typography>}
        <Typography variant="body2" color="text.secondary">{text.manualHint}</Typography>
      </Stack></Paper>
    </Box>
    }
    {activeTab === 'proposals' && <TextField select label={text.status} value={filters.status ?? ''} sx={{ width: { xs: '100%', sm: 280 } }} onChange={event => update({ status: event.target.value || undefined, page: '1' })}>
      <MenuItem value="">{text.all}</MenuItem>{Object.entries(text.statuses).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
    </TextField>}
    {activeTab === 'proposals' && data?.history.kind === 'proposals' && <DataTable label={text.proposals} rows={data.history.page.items} getRowKey={row => row.uuid} emptyMessage={text.empty} fillHeight pagination={pagination} columns={[
      { id: 'rate', label: text.rate, render: row => formatDecimal(row.proposedRate, rateFormat) },
      { id: 'author', label: text.author, render: row => actorDisplayName(row.requestedBy, identity, translations[locale].common.unknownUser) },
      { id: 'date', label: text.registered, render: row => formatInstant(row.registeredAt) },
      { id: 'status', label: text.status, render: row => <Chip size="small" variant="outlined" label={text.statuses[row.status]} /> },
      { id: 'actions', label: text.actions, align: 'center', render: row => <TableActionButton label={text.review} icon="view" onClick={() => show(row)} /> },
    ]} />}
    {activeTab === 'quotes' && data?.history.kind === 'quotes' && <DataTable label={text.quotes} rows={data.history.page.items} getRowKey={row => row.uuid} emptyMessage={text.empty} fillHeight pagination={pagination} columns={[
      { id: 'rate', label: text.rate, render: row => formatDecimal(row.rate, rateFormat) },
      { id: 'effective', label: text.effective, render: row => formatInstant(row.effectiveFrom) },
      { id: 'until', label: text.until, render: row => formatInstant(row.validUntil) },
      { id: 'id', label: text.identifier, render: row => row.uuid },
    ]} />}
    {dialog && <ProposalDialog open={open} initial={dialog.proposal} base={dialog.base} onClose={closeDialog} onExited={finishDialog} refresh={refresh} />}
  </Stack>;
}
