import { useEffect, useRef, useState } from 'react';
import { Box, Button, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { useSearchParams } from 'react-router';
import { NavigationLink } from '../../app/routes/NavigationLink';
import { useSession } from '../../auth/services/sessionContext';
import { can } from '../../auth/services/session';
import { DataTable } from '../../common/components/DataTable';
import { formatDecimal, moneyFormat } from '../../common/format/decimal';
import { formatInstant } from '../../common/format/dates';
import { translations, locale } from '../../i18n/pt-BR';
import { batchFilters, useBatchList } from '../services/useBatches';
import { BatchStatus } from '../components/BatchStatus';
export function BatchesPage({ active, searchParams }: { active: boolean; searchParams: string }) {
  const text = translations[locale].batch; const filters = batchFilters(new URLSearchParams(searchParams));
  const [, setParams] = useSearchParams(); const listing = useBatchList(filters, active);
  const { identity } = useSession(); const [search, setSearch] = useState(filters.q); const [previous, setPrevious] = useState(filters.q);
  if (previous !== filters.q) { setPrevious(filters.q); setSearch(filters.q); }
  const root = useRef<HTMLDivElement>(null); const scroll = useRef({ top: 0, left: 0 }); const origin = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!active) return;
    const region = root.current?.querySelector('[role="region"]');
    if (region) { region.scrollTop = scroll.current.top; region.scrollLeft = scroll.current.left; }
    origin.current?.focus({ preventScroll: true });
  }, [active]);
  function change(values: Record<string, string>) {
    const next = new URLSearchParams(searchParams);
    Object.entries(values).forEach(([key, value]) => { if (value) next.set(key, value); else next.delete(key); });
    setParams(next);
  }
  return <Stack ref={root} spacing={2.5} sx={{ display: active ? 'flex' : 'none', minWidth: 0, flex: 1 }}>
    <Stack direction="row" useFlexGap flexWrap="wrap" justifyContent="space-between" alignItems="flex-start" gap={2}>
      <Box><Typography variant="overline" color="text.secondary">{text.list.eyebrow}</Typography>
        <Typography component={active ? 'h1' : 'div'} variant="h1" tabIndex={-1}>{text.list.title}</Typography>
        <Typography color="text.secondary">{text.list.description}</Typography></Box>
      {can(identity, 'batchWrite') && <Button component={NavigationLink} to="/lotes/novo" variant="contained">{text.create.title}</Button>}
    </Stack>
    <Paper variant="outlined" sx={{ p: 2 }}><Stack component="form" direction="row" useFlexGap flexWrap="wrap" gap={1.5}
      onSubmit={event => { event.preventDefault(); change({ q: search.trim(), page: '1' }); }}>
      <TextField type="search" size="small" label={text.search} value={search} onChange={event => setSearch(event.target.value)} sx={{ flex: '1 1 260px' }} />
      <TextField select size="small" label={text.status} slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }} value={filters.status ?? ''} disabled={listing.isFetching} sx={{ minWidth: 180 }}
        onChange={event => change({ status: event.target.value, page: '1' })}>
        <MenuItem value="">{text.allStatuses}</MenuItem>
        {Object.entries(text.statuses).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
      </TextField>
      <Button type="submit" variant="outlined" disabled={listing.isFetching}>{text.searchAction}</Button>
      <Button disabled={listing.isFetching} onClick={() => { setSearch(''); change({ q: '', status: '', page: '1' }); }}>{text.clear}</Button>
    </Stack></Paper>
    <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
      <Typography color="text.secondary" variant="body2">{listing.data ? text.total(listing.data.totalItems) : text.table}</Typography>
      <Button disabled={listing.isFetching} onClick={() => { void listing.refetch(); }}>{text.refreshList}</Button>
    </Stack>
    {listing.data && <DataTable label={text.table} rows={listing.data.items} getRowKey={row => row.uuid} emptyMessage={text.empty}
      maxHeight="clamp(160px, calc(100dvh - 455px), 640px)" columns={[
        { id: 'id', label: text.identifier, render: row => <Typography variant="body2" sx={{ overflowWrap: 'anywhere', minWidth: 155 }}>{row.uuid}</Typography> },
        { id: 'assignor', label: text.assignors, render: row => row.soleAssignor?.name ?? text.mixed(row.assignorCount) },
        { id: 'status', label: text.status, render: row => <BatchStatus status={row.status} /> },
        { id: 'count', label: text.receivables, render: row => row.itemCount, align: 'right' },
        { id: 'amount', label: text.faceValue, render: row => formatDecimal(row.faceValueBrl, moneyFormat), align: 'right' },
        { id: 'date', label: text.registeredAt, render: row => formatInstant(row.registeredAt) },
        { id: 'action', label: text.actions, render: row => <Button component={NavigationLink} to={`/lotes/${row.uuid}`} onClick={event => {
          origin.current = event.currentTarget; const region = root.current?.querySelector('[role="region"]');
          scroll.current = { top: region?.scrollTop ?? 0, left: region?.scrollLeft ?? 0 };
        }}>{text.view}</Button> },
      ]} pagination={{ ...filters, totalItems: listing.data.totalItems, disabled: listing.isFetching,
        onChange: next => change({ page: String(next.page), size: String(next.size) }) }} />}
  </Stack>;
}
