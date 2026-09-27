import { useState } from 'react';
import { Button, Collapse, Stack, useMediaQuery } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useApiClient } from '../../common/http/useApiClient';
import { useAppFeedback } from '../../common/components/feedbackContext';
import { DataTable } from '../../common/components/DataTable';
import { AppDialog } from '../../common/components/AppDialog';
import { pageOf } from '../../common/http/contracts';
import { formatInstant } from '../../common/format/dates';
import { requestSchema, type SettlementRequest } from '../services/contracts';
import { AcceptedRequest } from './AcceptedRequest';
import { locale, translations } from '../../i18n/pt-BR';
const schema = pageOf(requestSchema);
export function RequestHistory({ batchUuid }: { batchUuid: string }) {
  const text = translations[locale]; const api = useApiClient(); const { beginLoading } = useAppFeedback();
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [expanded, setExpanded] = useState(false); const [pagination, setPagination] = useState({ page: 1, size: 5 });
  const [selected, setSelected] = useState<SettlementRequest | null>(null); const [open, setOpen] = useState(false);
  const rows = useQuery({ queryKey: ['settlement', 'history', batchUuid, pagination], enabled: expanded,
    queryFn: async ({ signal }) => { const end = beginLoading();
      try { return (await api.request(`/api/batches/${batchUuid}/settlements`, { schema, query: pagination, signal })).data; } finally { end(); }
    }, placeholderData: (old, query) => query?.queryKey[2] === batchUuid ? old : undefined });
  return <Stack spacing={1}>
    <Button sx={{ alignSelf: 'flex-start' }} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{text.settlement.flow.history}</Button>
    <Collapse in={expanded} timeout={reduced ? 0 : 180}>
      <Button disabled={rows.isFetching} onClick={() => { void rows.refetch(); }}>{text.batch.refreshList}</Button>
      {rows.data && <DataTable label={text.settlement.flow.history} rows={rows.data.items} getRowKey={row => row.uuid} maxHeight={240} columns={[
        { id: 'uuid', label: text.settlement.flow.identifier, render: row => row.uuid },
        { id: 'date', label: text.settlement.flow.accepted, render: row => formatInstant(row.acceptedAt) },
        { id: 'status', label: text.batch.status, render: row => text.batch.statuses[row.status] },
        { id: 'view', label: text.batch.view, render: row => <Button onClick={() => { if (selected) return; setSelected(row); setOpen(true); }}>{text.batch.view}</Button> },
      ]} pagination={{ ...pagination, totalItems: rows.data.totalItems, disabled: rows.isFetching, onChange: setPagination }} />}
    </Collapse>
    {selected && <AppDialog open={open} title={text.settlement.flow.history} onClose={() => setOpen(false)} onExited={() => setSelected(null)} closeLabel={text.settlement.flow.cancel}>
      <AcceptedRequest request={selected} />
    </AppDialog>}
  </Stack>;
}
