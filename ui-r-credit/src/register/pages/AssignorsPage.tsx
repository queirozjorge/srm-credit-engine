import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Box, Button, Checkbox, Chip, FormControlLabel, Paper, Stack, TextField, Typography } from '@mui/material';
import { useSearchParams } from 'react-router';
import { DataTable } from '../../common/components/DataTable';
import { RefreshButton } from '../../common/components/RefreshButton';
import { TableActionButton } from '../../common/components/TableActionButton';
import { formatCnpj } from '../../common/format/document';
import { useAppFeedback } from '../../common/components/feedbackContext';
import { uuid } from '../../common/http/contracts';
import { useSession } from '../../auth/services/sessionContext';
import { can } from '../../auth/services/session';
import { locale, translations } from '../../i18n/pt-BR';
import { listParameters, normalizeSearch } from '../services/validation';
import { useAssignors } from '../services/useAssignors';
import type { Assignor } from '../services/contracts';
import { AssignorDetail } from '../components/AssignorDetail';
import { AssignorEditor } from '../components/AssignorEditor';

export function AssignorsPage() {
  const text = translations[locale].register;
  const [params, setParams] = useSearchParams(); const filters = listParameters(params);
  const selected = params.get('cedente');
  const { identity } = useSession(); const writable = can(identity, 'assignorWrite');
  const { showWarning } = useAppFeedback();
  const { listing, detail, refreshDetail, refreshList } = useAssignors(filters, selected);
  const [search, setSearch] = useState(filters.q); const [previousQuery, setPreviousQuery] = useState(filters.q);
  if (previousQuery !== filters.q) { setPreviousQuery(filters.q); setSearch(filters.q); }
  const [editor, setEditor] = useState<{ initial: Assignor | null } | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null); const origin = useRef<HTMLElement | null>(null);
  const listView = useRef<HTMLDivElement>(null); const scroll = useRef(0);
  const validSelection = !selected || uuid.safeParse(selected).success;
  useEffect(() => { if (!validSelection) showWarning({ message: text.invalidIdentifier }); }, [validSelection, showWarning, text.invalidIdentifier]);
  useLayoutEffect(() => {
    if (selected) heading.current?.focus({ preventScroll: true });
    else {
      const region = listView.current?.querySelector('[role="region"]');
      if (region) region.scrollTop = scroll.current;
      origin.current?.focus({ preventScroll: true });
    }
  }, [selected]);
  function change(values: Record<string, string | null>) {
    setParams(current => { const next = new URLSearchParams(current); Object.entries(values).forEach(([key, value]) => {
      if (value === null || value === '') next.delete(key); else next.set(key, value);
    }); return next; });
  }
  function openEditor(initial: Assignor | null) {
    if (editor || !writable) return;
    setEditor({ initial }); setEditorOpen(true);
  }
  function openDetail(row: Assignor, trigger: HTMLElement) {
    origin.current = trigger;
    scroll.current = listView.current?.querySelector('[role="region"]')?.scrollTop ?? 0;
    change({ cedente: row.uuid });
  }
  return <Stack spacing={2.5} sx={{ minWidth: 0, minHeight: { md: 0 }, flex: 1,
    overflowY: { xs: 'visible', md: selected ? 'auto' : 'hidden' } }}>
    <Stack direction="row" useFlexGap flexWrap="wrap" justifyContent="space-between" alignItems="flex-start" gap={2}>
      <Box><Typography variant="overline" color="text.secondary">{text.eyebrow}</Typography>
        <Typography component="h1" variant="h1" tabIndex={-1} sx={{ my: 0.5 }}>{text.title}</Typography>
        <Typography color="text.secondary">{text.description}</Typography></Box>
      {!selected && writable && <Button variant="contained" onClick={() => openEditor(null)}>{text.create}</Button>}
    </Stack>
    <Stack ref={listView} spacing={{ xs: 1.5, md: 0.75 }} sx={{ display: selected ? 'none' : 'flex', minWidth: 0,
      minHeight: { md: 0 }, flex: 1, overflow: { xs: 'visible', md: 'hidden' } }}>
      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <Stack component="form" direction="row" useFlexGap flexWrap="wrap" gap={1.5} alignItems="center"
          onSubmit={event => { event.preventDefault(); change({ q: normalizeSearch(search), page: '1' }); }}>
          <TextField label={text.search} placeholder={text.searchHint} type="search" value={search} size="small"
            onChange={event => setSearch(event.target.value)} sx={{ flex: '1 1 260px', minWidth: 0 }} />
          <Button type="submit" variant="outlined" disabled={listing.isFetching}>{text.searchAction}</Button>
          <Button onClick={() => { setSearch(''); change({ q: null, page: '1' }); }} disabled={listing.isFetching}>{text.clear}</Button>
          <FormControlLabel label={text.activeOnly} control={<Checkbox checked={filters.activeOnly} disabled={listing.isFetching}
            onChange={(_, checked) => change({ activeOnly: checked ? 'true' : null, page: '1' })} />} />
        </Stack>
      </Paper>
      <Stack direction="row" useFlexGap flexWrap="wrap" justifyContent="flex-start" alignItems="center" gap={0.5}>
        <Typography variant="body2" color="text.secondary">{listing.data ? text.total(listing.data.totalItems) : text.table}</Typography>
        <RefreshButton label={text.retry} onClick={() => { void listing.refetch(); }} disabled={listing.isFetching} />
      </Stack>
      {listing.data && <DataTable label={text.table} rows={listing.data.items} getRowKey={row => row.uuid} emptyMessage={text.empty}
        fillHeight
        columns={[
          { id: 'name', label: text.name, render: row => <Typography variant="body2" sx={{ maxWidth: 340, overflowWrap: 'anywhere', fontWeight: 600 }}>{row.name}</Typography> },
          { id: 'document', label: text.document, render: row => <Box component="span" sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{formatCnpj(row.documentNumber)}</Box> },
          { id: 'status', label: text.status, render: row => <Chip size="small" variant="outlined" label={row.deleted ? text.inactive : text.active} /> },
          { id: 'actions', label: text.actions, align: 'center', render: row => <TableActionButton label={text.view} icon="view"
            onClick={event => openDetail(row, event.currentTarget)} /> },
        ]} pagination={{ ...filters, totalItems: listing.data.totalItems, disabled: listing.isFetching,
          onChange: next => change({ page: String(next.page), size: String(next.size) }) }} />}
    </Stack>
    {selected && <Stack spacing={3}>
      <Stack direction="row" useFlexGap flexWrap="wrap" justifyContent="space-between" alignItems="center" gap={2}>
        <Typography ref={heading} component="h2" variant="h2" tabIndex={-1}>{text.detail}</Typography>
        <Stack direction="row" useFlexGap flexWrap="wrap" gap={1}>
          <Button onClick={() => change({ cedente: null })}>{text.back}</Button>
          {writable && detail.data && <Button variant="contained" disabled={detail.isFetching || detail.isError} onClick={() => openEditor(detail.data)}>{text.edit}</Button>}
        </Stack>
      </Stack>
      {detail.data && <AssignorDetail row={detail.data} />}
    </Stack>}
    {editor && <AssignorEditor open={editorOpen} initial={editor.initial} onClose={() => setEditorOpen(false)} onExited={() => setEditor(null)}
      refreshDetail={refreshDetail} refreshList={refreshList} />}
  </Stack>;
}
