import { useState } from 'react';
import { Chip, Paper, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { AppDialog } from '../../common/components/AppDialog';
import { FinancialTotals } from '../../common/components/FinancialTotals';
import { DataTable } from '../../common/components/DataTable';
import { TableActionButton } from '../../common/components/TableActionButton';
import { useApiClient } from '../../common/http/useApiClient';
import { useAppFeedback } from '../../common/components/feedbackContext';
import { pageOf } from '../../common/http/contracts';
import { formatCivilDate, formatInstant } from '../../common/format/dates';
import { formatDecimal, moneyFormat, rateFormat } from '../../common/format/decimal';
import { BatchStatus } from '../../batch/components/BatchStatus';
import { useSession } from '../../auth/services/sessionContext';
import { actorDisplayName } from '../../auth/services/session';
import { requestItemSchema, type SettlementRequest, type ItemFailure } from '../services/contracts';
import { locale, translations } from '../../i18n/pt-BR';
const itemsSchema = pageOf(requestItemSchema);
export function AcceptedRequest({ request, active = true, detailsModal = false, resultsOnly = false }: { request: SettlementRequest; active?: boolean; detailsModal?: boolean; resultsOnly?: boolean }) {
  const text = translations[locale].settlement.flow; const api = useApiClient(); const { beginLoading } = useAppFeedback(); const { identity } = useSession();
  const [failure, setFailure] = useState<{ reference: string; details: ItemFailure } | null>(null);
  const [failureOpen, setFailureOpen] = useState(false);
  const copy = translations[locale].batch;
  function closeFailure() { setFailureOpen(false); }
  const [pagination, setPagination] = useState({ page: 1, size: 5 });
  const items = useQuery({ queryKey: ['settlement', 'items', request.uuid, pagination], enabled: (detailsModal || resultsOnly) && active,
    queryFn: async ({ signal }) => {
      const end = beginLoading();
      try { return (await api.request(`/api/settlement-requests/${request.uuid}/items`, { schema: itemsSchema, query: pagination, signal })).data; }
      finally { end(); }
    }, placeholderData: (old, query) => query?.queryKey[2] === request.uuid ? old : undefined });
  return <Paper variant="outlined" sx={{ p: resultsOnly ? 0 : 2.5, minWidth: 0, border: resultsOnly ? 0 : undefined }}><Stack spacing={2}>
    {!resultsOnly && <Stack direction="row" useFlexGap flexWrap="wrap" gap={1} justifyContent="space-between">
      <Typography component={detailsModal ? 'h3' : 'h2'} variant={detailsModal ? 'h3' : 'h2'}>{text.accepted}</Typography>
      <BatchStatus status={request.status} />
    </Stack>}
    {!resultsOnly && <>
      <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{text.request(request.uuid, formatInstant(request.acceptedAt), actorDisplayName(request.requestedBy, identity, translations[locale].common.unknownUser))}</Typography>
      <Typography variant="body2">{text.snapshot(formatCivilDate(request.snapshot.calculationDate), formatDecimal(request.snapshot.baseRate, rateFormat), request.snapshot.calculationVersion)}</Typography>
      {request.snapshot.exchangeRate && <Typography variant="body2">{text.exchange(formatDecimal(request.snapshot.exchangeRate.rate, rateFormat), formatInstant(request.snapshot.exchangeRate.effectiveFrom))}</Typography>}
      <Typography variant="body2">{text.requestCounts(request.counts.pending, request.counts.settled, request.counts.failed)}</Typography>
      {request.status === 'PENDING' && <Typography role="status">{text.pending}</Typography>}
      {request.completedAt && <Typography variant="body2">{text.completed(formatInstant(request.completedAt))}</Typography>}
      <FinancialTotals values={request.settledTotals} />
    </>}
    {(detailsModal || resultsOnly) && <Stack spacing={1}>
      <Typography component="h3" variant="h3">{text.itemsTable}</Typography>
      {items.data && <DataTable label={text.itemsTable} rows={items.data.items} getRowKey={row => row.receivable.uuid}
        maxHeight="min(58dvh, 640px)"
        columns={[
          { id: 'reference', label: translations[locale].batch.reference, render: row => <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{row.receivable.externalReference}</Typography> },
          { id: 'status', label: copy.status, render: row => <Stack spacing={0.5} alignItems="flex-start">
            <Typography variant="body2">{copy.statuses[row.status]}</Typography>
            {row.hasError && <Chip size="small" color="error" variant="outlined" label={copy.errorFlag} />}
            {row.failure && <TableActionButton label={copy.failure} icon="failure" onClick={() => {
              if (failure) return;
              setFailure({ reference: row.receivable.externalReference, details: row.failure! }); setFailureOpen(true);
            }} />}
          </Stack> },
          { id: 'days', label: translations[locale].pricing.days, render: row => row.terms ? row.terms.days : text.noResult },
          { id: 'spread', label: translations[locale].pricing.spread, render: row => row.terms ? formatDecimal(row.terms.spread, rateFormat) : text.noResult },
          { id: 'payment', label: translations[locale].pricing.payment, render: row => row.result ? `${row.result.paymentCurrency} ${formatDecimal(row.result.paymentValue, moneyFormat)}` : text.noResult },
        ]} pagination={{ ...pagination, totalItems: items.data.totalItems, disabled: items.isFetching, onChange: setPagination }} />}
    </Stack>}
    {failure && <AppDialog open={failureOpen} title={copy.errorTitle(failure.reference)} onClose={closeFailure}
      onExited={() => setFailure(null)} closeLabel={translations[locale].common.understood}>
      <Stack spacing={1.5} sx={{ py: 1 }}>
        <Typography sx={{ overflowWrap: 'anywhere' }}>{failure.details.message}</Typography>
        <Typography variant="body2">{copy.errorStage}: {translations[locale].settlement.audit.stage[failure.details.stage]}</Typography>
        <Typography variant="body2">{copy.errorOccurredAt}: {formatInstant(failure.details.occurredAt)}</Typography>
        <Typography variant="caption" color="text.secondary">{copy.errorCode}: {failure.details.code}</Typography>
      </Stack>
    </AppDialog>}
  </Stack></Paper>;
}
