import { useState } from 'react';
import { Button, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useApiClient } from '../../common/http/useApiClient';
import { useAppFeedback } from '../../common/components/feedbackContext';
import { DataTable } from '../../common/components/DataTable';
import { TableActionButton } from '../../common/components/TableActionButton';
import { AppDialog } from '../../common/components/AppDialog';
import { pageOf } from '../../common/http/contracts';
import { formatInstant } from '../../common/format/dates';
import { requestSchema, type SettlementRequest } from '../services/contracts';
import { AcceptedRequest } from './AcceptedRequest';
import { locale, translations } from '../../i18n/pt-BR';
const schema = pageOf(requestSchema);
export function RequestHistory({ batchUuid, activeRequest, active = true }: { batchUuid: string; activeRequest: SettlementRequest; active?: boolean }) {
  const text = translations[locale]; const api = useApiClient(); const { beginLoading } = useAppFeedback();
  const [historyOpen, setHistoryOpen] = useState(false); const [pagination, setPagination] = useState({ page: 1, size: 5 });
  const [resultsOpen, setResultsOpen] = useState(false);
  const [selected, setSelected] = useState<SettlementRequest | null>(null); const [detailOpen, setDetailOpen] = useState(false);
  const rows = useQuery({ queryKey: ['settlement', 'history', batchUuid, pagination], enabled: historyOpen && active,
    queryFn: async ({ signal }) => { const end = beginLoading();
      try { return (await api.request(`/api/batches/${batchUuid}/settlements`, { schema, query: pagination, signal })).data; } finally { end(); }
    }, placeholderData: (old, query) => query?.queryKey[2] === batchUuid ? old : undefined });
  return <Stack spacing={1} sx={{ minWidth: 0 }}>
    <Stack direction="row" useFlexGap flexWrap="wrap" gap={1}>
      <Button aria-haspopup="dialog" onClick={() => setHistoryOpen(true)}>{text.settlement.flow.history}</Button>
      <Button aria-haspopup="dialog" onClick={() => setResultsOpen(true)}>{text.settlement.flow.results}</Button>
    </Stack>
    <AppDialog open={historyOpen} title={text.settlement.flow.historyTitle} maxWidth="xl" onClose={() => setHistoryOpen(false)} closeLabel={text.common.close}>
      <Stack spacing={1} sx={{ minWidth: 0 }}>
      {rows.data && <DataTable label={text.settlement.flow.historyTitle} rows={rows.data.items} getRowKey={row => row.uuid} maxHeight="min(60dvh, 680px)" columns={[
        { id: 'uuid', label: text.settlement.flow.identifier, render: row => <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{row.uuid}</Typography> },
        { id: 'date', label: text.settlement.flow.accepted, render: row => formatInstant(row.acceptedAt) },
        { id: 'status', label: text.batch.status, render: row => text.batch.statuses[row.status] },
        { id: 'view', label: text.batch.view, align: 'center', render: row => <TableActionButton label={text.batch.view} icon="view"
          onClick={() => { if (selected) return; setSelected(row); setDetailOpen(true); }} /> },
      ]} pagination={{ ...pagination, totalItems: rows.data.totalItems, disabled: rows.isFetching, onChange: setPagination }} />}
      </Stack>
    </AppDialog>
    <AppDialog open={resultsOpen} title={text.settlement.flow.results} maxWidth="xl"
      onClose={() => setResultsOpen(false)} closeLabel={text.common.close}>
      <AcceptedRequest request={activeRequest} active={active && resultsOpen} resultsOnly />
    </AppDialog>
    {selected && <AppDialog open={detailOpen} title={text.settlement.flow.requestDetail} maxWidth="xl"
      onClose={() => setDetailOpen(false)} onExited={() => setSelected(null)} closeLabel={text.common.close}>
      <AcceptedRequest request={selected} active={active && detailOpen} detailsModal />
    </AppDialog>}
  </Stack>;
}
