import { useState } from 'react';
import { Button, Stack, TextField, Typography } from '@mui/material';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { DataTable } from '../../common/components/DataTable';
import { useApiClient } from '../../common/http/useApiClient';
import { useAppFeedback } from '../../common/components/feedbackContext';
import { formatCnpj } from '../../common/format/document';
import { locale, translations } from '../../i18n/pt-BR';
import { assignorPageSchema, type Assignor } from '../services/contracts';
import { normalizeSearch } from '../services/validation';
export function AssignorPicker({ enabled, selected, onSelect, activeOnly = true }: { activeOnly?: boolean; enabled: boolean; selected: string; onSelect: (row: Assignor) => void }) {
  const text = translations[locale].register; const api = useApiClient(); const { beginLoading } = useAppFeedback();
  const [search, setSearch] = useState(''); const [filters, setFilters] = useState({ q: '', page: 1, size: 5 });
  const query = useQuery({ queryKey: ['assignors', 'picker', activeOnly, filters], enabled, placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => {
      await Promise.resolve(); signal.throwIfAborted(); const end = beginLoading();
      try { return (await api.request('/api/assignors', { schema: assignorPageSchema, signal, query: { ...filters, activeOnly } })).data; }
      finally { end(); }
    } });
  return <Stack spacing={1.5}>
    <Typography component="h3" variant="subtitle2">{text.choose}</Typography>
    <Stack direction="row" useFlexGap flexWrap="wrap" gap={1}>
      <TextField type="search" size="small" label={text.search} value={search} disabled={!enabled}
        onChange={event => setSearch(event.target.value)} sx={{ flex: '1 1 220px' }} />
      <Button disabled={!enabled || query.isFetching} onClick={() => setFilters({ ...filters, q: normalizeSearch(search), page: 1 })}>{text.searchAction}</Button>
      <Button disabled={!enabled || query.isFetching} onClick={() => { void query.refetch(); }}>{text.retry}</Button>
    </Stack>
    {query.data && <DataTable label={text.choose} rows={query.data.items} getRowKey={row => row.uuid} emptyMessage={activeOnly ? text.noActive : translations[locale].common.empty} maxHeight={220}
      columns={[
        { id: 'name', label: text.name, render: row => row.name },
        { id: 'document', label: text.document, render: row => formatCnpj(row.documentNumber) },
        { id: 'action', label: text.actions, render: row => <Button disabled={!enabled || query.isFetching || (activeOnly && row.deleted)} aria-pressed={selected === row.uuid}
          onClick={() => onSelect(row)}>{selected === row.uuid ? text.selected : text.select}</Button> },
      ]} pagination={{ ...filters, totalItems: query.data.totalItems, disabled: !enabled || query.isFetching,
        onChange: page => setFilters({ ...filters, ...page }) }} />}
  </Stack>;
}
