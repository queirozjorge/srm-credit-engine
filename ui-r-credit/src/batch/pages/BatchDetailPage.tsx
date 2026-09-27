import { SettlementFlow } from '../../settlement/components/SettlementFlow';
import { useEffect } from 'react';
import { Box, Button, Paper, Stack, Typography } from '@mui/material';
import { useParams, useSearchParams } from 'react-router';
import { NavigationLink } from '../../app/routes/NavigationLink';
import { DataTable } from '../../common/components/DataTable';
import { useAppFeedback } from '../../common/components/feedbackContext';
import { formatDecimal, moneyFormat } from '../../common/format/decimal';
import { formatCivilDate, formatInstant } from '../../common/format/dates';
import { locale, translations } from '../../i18n/pt-BR';
import { pagination, useBatchDetail } from '../services/useBatches';
import { BatchStatus } from '../components/BatchStatus';
export function BatchDetailPage() {
  const text = translations[locale].batch; const { batchUuid = '' } = useParams();
  const [params, setParams] = useSearchParams(); const filters = pagination(params);
  const { detail, items, valid } = useBatchDetail(batchUuid, filters); const { showWarning } = useAppFeedback();
  useEffect(() => { if (!valid) showWarning({ message: text.invalidIdentifier }); }, [valid, showWarning, text.invalidIdentifier]);
  const row = detail.data;
  const fields = row ? [
    [text.identifier, row.uuid], [text.assignors, row.soleAssignor?.name ?? text.mixed(row.assignorCount)],
    [text.source, text.sources[row.source]], [text.faceValue, formatDecimal(row.faceValueBrl, moneyFormat)],
    [text.receivables, String(row.itemCount)], [text.registeredAt, formatInstant(row.registeredAt)],
    [text.createdBy, `${row.createdBy.subject} · ${row.createdBy.issuer}`],
  ] : [];
  return <Stack spacing={2.5} sx={{ minWidth: 0, flex: 1 }}>
    <Stack direction="row" useFlexGap flexWrap="wrap" justifyContent="space-between" gap={2}>
      <Box><Typography variant="overline" color="text.secondary">{text.detail.eyebrow}</Typography>
        <Typography component="h1" variant="h1" tabIndex={-1}>{text.detail.title}</Typography>
        <Typography color="text.secondary">{text.detail.description}</Typography></Box>
      <Stack direction="row" useFlexGap flexWrap="wrap" gap={1}>
        <Button component={NavigationLink} to="/lotes">{text.back}</Button>
        {valid && <Button disabled={detail.isFetching} onClick={() => { void detail.refetch(); }}>{text.refresh}</Button>}
      </Stack>
    </Stack>
    {row && <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" gap={2} sx={{ mb: 2 }}>
        <Typography component="h2" variant="h2">{text.summary}</Typography><BatchStatus status={row.status} />
      </Stack>
      <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' }, gap: 2 }}>
        {fields.map(([label, value]) => <Box key={label} sx={{ minWidth: 0 }}>
          <Typography component="dt" variant="caption" color="text.secondary">{label}</Typography>
          <Typography component="dd" variant="body2" sx={{ m: 0, overflowWrap: 'anywhere', fontWeight: 600 }}>{value}</Typography>
        </Box>)}
      </Box>
    </Paper>}
    {row && <SettlementFlow batch={row} available={!detail.isError && !detail.isFetching} />}
    {row && <Stack spacing={1.5} sx={{ minWidth: 0 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
        <Typography component="h2" variant="h2">{text.receivables}</Typography>
        <Button disabled={items.isFetching || detail.isError} onClick={() => { void items.refetch(); }}>{text.refreshItems}</Button>
      </Stack>
      {items.data && <DataTable label={text.receivables} rows={items.data.items} getRowKey={item => item.uuid} emptyMessage={text.emptyItems}
        maxHeight="clamp(160px, calc(100dvh - 640px), 500px)" columns={[
          { id: 'reference', label: text.reference, render: item => <Typography variant="body2" sx={{ overflowWrap: 'anywhere', maxWidth: 220 }}>{item.externalReference}</Typography> },
          { id: 'assignor', label: text.assignors, render: item => item.assignorName },
          { id: 'type', label: text.type, render: item => text.types[item.type] },
          { id: 'amount', label: text.faceValue, render: item => formatDecimal(item.faceValueBrl, moneyFormat), align: 'right' },
          { id: 'due', label: text.dueDate, render: item => formatCivilDate(item.dueDate) },
          { id: 'currency', label: text.currency, render: item => text.currencies[item.paymentCurrency] },
        ]} pagination={{ ...filters, totalItems: items.data.totalItems, disabled: items.isFetching,
          onChange: next => setParams(current => { const updated = new URLSearchParams(current); updated.set('page', String(next.page)); updated.set('size', String(next.size)); return updated; }) }} />}
    </Stack>}
  </Stack>;
}
