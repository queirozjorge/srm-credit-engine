import { useRef, useState } from 'react';
import { Button, Collapse, Paper, Stack, Typography, useMediaQuery } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { FinancialTotals } from '../../common/components/FinancialTotals';
import { DataTable } from '../../common/components/DataTable';
import { useApiClient } from '../../common/http/useApiClient';
import { pageOf } from '../../common/http/contracts';
import { useAppFeedback } from '../../common/components/feedbackContext';
import { formatCivilDate, formatInstant } from '../../common/format/dates';
import { formatDecimal, moneyFormat, rateFormat } from '../../common/format/decimal';
import { BatchStatus } from '../../batch/components/BatchStatus';
import { requestItemSchema, type SettlementRequest } from '../services/contracts';
import { locale, translations } from '../../i18n/pt-BR';
const itemsSchema = pageOf(requestItemSchema);
export function AcceptedRequest({ request }: { request: SettlementRequest }) {
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const text = translations[locale].settlement.flow; const api = useApiClient(); const { beginLoading, showWarning } = useAppFeedback();
  const [expanded, setExpanded] = useState(false); const [pagination, setPagination] = useState({ page: 1, size: 5 });
  const previous = useRef<{ uuid: string; status: string; page: number; size: number } | null>(null);
  const items = useQuery({ queryKey: ['settlement', 'items', request.uuid, request.status, pagination], enabled: expanded,
    queryFn: async ({ signal }) => { const old = previous.current;
      const background = old?.uuid === request.uuid && old.page === pagination.page && old.size === pagination.size && old.status !== request.status;
      previous.current = { uuid: request.uuid, status: request.status, ...pagination };
      const end = background ? () => {} : beginLoading();
      try { return (await api.request(`/api/settlement-requests/${request.uuid}/items`, { schema: itemsSchema, query: pagination, signal })).data; }
      finally { end(); }
    }, placeholderData: (old, query) => query?.queryKey[2] === request.uuid ? old : undefined });
  return <Paper variant="outlined" sx={{ p: 2.5, minWidth: 0 }}><Stack spacing={2}>
    <Stack direction="row" useFlexGap flexWrap="wrap" gap={1} justifyContent="space-between"><Typography component="h2" variant="h2">{text.accepted}</Typography><BatchStatus status={request.status} /></Stack>
    <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{text.request(request.uuid, formatInstant(request.acceptedAt), request.requestedBy.subject)}</Typography>
    <Typography variant="body2">{text.snapshot(formatCivilDate(request.snapshot.calculationDate), formatDecimal(request.snapshot.baseRate, rateFormat), request.snapshot.calculationVersion)}</Typography>
    {request.snapshot.exchangeRate && <Typography variant="body2">{text.exchange(formatDecimal(request.snapshot.exchangeRate.rate, rateFormat), formatInstant(request.snapshot.exchangeRate.effectiveFrom))}</Typography>}
    {request.status === 'PENDING' && <Typography role="status">{text.pending}</Typography>}
    {request.result && <><Typography variant="body2">{text.completed(formatInstant(request.result.settledAt))}</Typography><FinancialTotals values={request.result.totals} /></>}
    {request.failure && <Button sx={{ alignSelf: 'flex-start' }} onClick={() => showWarning({ message: request.failure!.message })}>{text.failure}</Button>}
    <Button sx={{ alignSelf: 'flex-start' }} onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>{text.items}</Button>
    <Collapse in={expanded} timeout={reduced ? 0 : 180}>
    <Button disabled={items.isFetching} onClick={() => { void items.refetch(); }}>{translations[locale].batch.refreshList}</Button>
    {items.data && <DataTable label={text.items} rows={items.data.items} getRowKey={row => row.receivable.uuid} maxHeight={260}
      columns={[
        { id: 'reference', label: translations[locale].batch.reference, render: row => row.receivable.externalReference },
        { id: 'days', label: translations[locale].pricing.days, render: row => row.terms.days },
        { id: 'spread', label: translations[locale].pricing.spread, render: row => formatDecimal(row.terms.spread, rateFormat) },
        { id: 'payment', label: translations[locale].pricing.payment, render: row => request.status === 'SETTLED' && row.result ? `${row.result.paymentCurrency} ${formatDecimal(row.result.paymentValue, moneyFormat)}` : text.noResult },
      ]} pagination={{ ...pagination, totalItems: items.data.totalItems, disabled: items.isFetching, onChange: setPagination }} />}
    </Collapse>
  </Stack></Paper>;
}
