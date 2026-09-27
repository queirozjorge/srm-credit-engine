import { useEffect, useState } from 'react';
import { Box, Button, IconButton, Paper, Stack, Tab, Tabs, Tooltip, Typography } from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'react-router';
import { useSession } from '../../auth/services/sessionContext';
import { actorDisplayName } from '../../auth/services/session';
import { NavigationLink } from '../../app/routes/NavigationLink';
import { AppDialog } from '../../common/components/AppDialog';
import { FinancialTotals } from '../../common/components/FinancialTotals';
import { RefreshButton } from '../../common/components/RefreshButton';
import { useAppFeedback } from '../../common/components/feedbackContext';
import { formatDecimal, moneyFormat } from '../../common/format/decimal';
import { formatInstant } from '../../common/format/dates';
import { locale, translations } from '../../i18n/pt-BR';
import { FailedReceivablesTable } from '../components/FailedReceivablesTable';
import { BatchAuditTab } from '../../settlement/components/BatchAuditTab';
import { SettlementFlow } from '../../settlement/components/SettlementFlow';
import type { ItemFailure } from '../../settlement/services/contracts';
import { BatchStatus } from '../components/BatchStatus';
import { pagination, useBatchDetail } from '../services/useBatches';

type DetailTab = 'summary' | 'receivables' | 'requests' | 'audit';

export function BatchDetailPage() {
  const text = translations[locale].batch;
  const { identity } = useSession();
  const { batchUuid = '' } = useParams();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const filters = pagination(params);
  const selected = params.get('tab');
  const activeTab: DetailTab = selected === 'receivables' || selected === 'requests' || selected === 'audit' ? selected : 'summary';
  const { detail, items, valid } = useBatchDetail(batchUuid, filters, activeTab === 'receivables');
  const { showWarning } = useAppFeedback();
  const [selectedFailure, setSelectedFailure] = useState<{ uuid: string; reference: string; failure: ItemFailure } | null>(null);
  const [failureDialogOpen, setFailureDialogOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!valid) showWarning({ message: text.invalidIdentifier });
  }, [valid, showWarning, text.invalidIdentifier]);

  function changeTab(next: DetailTab, receivableUuid?: string) {
    setParams(current => {
      const updated = new URLSearchParams(current);
      if (next === 'summary') updated.delete('tab');
      else updated.set('tab', next);
      if (receivableUuid) {
        updated.set('auditReceivableUuid', receivableUuid);
        updated.set('auditPage', '1');
      }
      return updated;
    }, { preventScrollReset: true });
  }

  const row = detail.data;
  const fields: [string, string][] = row ? [
    [text.identifier, row.uuid], [text.assignors, row.soleAssignor?.name ?? text.mixed(row.assignorCount)],
    [text.source, text.sources[row.source]], [text.faceValue, formatDecimal(row.faceValueBrl, moneyFormat)],
    [text.receivables, String(row.itemCount)], [text.registeredAt, formatInstant(row.registeredAt)],
    [text.createdBy, actorDisplayName(row.createdBy, identity, translations[locale].common.unknownUser)],
  ] : [];
  const tabId = (tab: DetailTab) => `batch-${batchUuid}-tab-${tab}`;
  const panelId = (tab: DetailTab) => `batch-${batchUuid}-panel-${tab}`;

  function openFailure(uuid: string, reference: string, failure: ItemFailure) {
    if (selectedFailure) return;
    setSelectedFailure({ uuid, reference, failure });
    setFailureDialogOpen(true);
  }

  function finishFailureDialog() { setSelectedFailure(null); }

  async function refreshDetails() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await detail.refetch();
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ['batches', 'items', batchUuid], type: 'active' }),
        queryClient.refetchQueries({ queryKey: ['settlement', 'history', batchUuid], type: 'active' }),
        queryClient.refetchQueries({ queryKey: ['settlement', 'items'], type: 'active' }),
        queryClient.refetchQueries({ queryKey: ['settlement', 'audit', batchUuid], type: 'active' }),
      ]);
    } finally {
      setRefreshing(false);
    }
  }

  return <Stack spacing={{ xs: 2, md: 1.5 }} sx={{ minWidth: 0, minHeight: { md: 0 }, flex: 1,
    overflowY: { xs: 'visible', md: 'hidden' } }}>
    <Stack direction="row" useFlexGap flexWrap="wrap" justifyContent="space-between" gap={2}>
      <Box>
        <Typography variant="overline" color="text.secondary">{text.detail.eyebrow}</Typography>
        <Typography component="h1" variant="h1" tabIndex={-1}>{text.detail.title}</Typography>
        <Typography color="text.secondary">{text.detail.description}</Typography>
      </Box>
      <Stack direction="row" useFlexGap flexWrap="wrap" gap={1}>
        <Tooltip title={text.back}>
          <IconButton component={NavigationLink} to="/lotes" aria-label={text.back}
            sx={{ width: 44, height: 44, flexShrink: 0, color: 'primary.main' }}>
            <Box component="svg" aria-hidden="true" viewBox="0 0 24 24"
              sx={{ width: 24, height: 24, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
              <path d="M19 12H5m7-7-7 7 7 7" />
            </Box>
          </IconButton>
        </Tooltip>
        {valid && <RefreshButton label={text.refresh} disabled={detail.isFetching || refreshing} onClick={() => { void refreshDetails(); }} />}
      </Stack>
    </Stack>

    {row && <>
      <Tabs value={activeTab} aria-label={text.detailTabs.label} variant="scrollable" scrollButtons="auto"
        onChange={(_, value: DetailTab) => changeTab(value)}>
        <Tab id={tabId('summary')} aria-controls={panelId('summary')} value="summary" label={text.detailTabs.summary} />
        <Tab id={tabId('receivables')} aria-controls={panelId('receivables')} value="receivables" label={text.detailTabs.receivables} />
        <Tab id={tabId('requests')} aria-controls={panelId('requests')} value="requests" label={text.detailTabs.requests} />
        <Tab id={tabId('audit')} aria-controls={panelId('audit')} value="audit" label={text.detailTabs.audit} />
      </Tabs>

      <Box role="tabpanel" id={panelId('summary')} aria-labelledby={tabId('summary')} hidden={activeTab !== 'summary'}
        sx={{ display: activeTab === 'summary' ? 'block' : 'none', minWidth: 0, minHeight: 0, flex: 1,
          overflowY: { xs: 'visible', md: 'auto' } }}>
        <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, minWidth: 0 }}>
          <Stack spacing={2}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" gap={2}>
              <Typography component="h2" variant="h2">{text.summary}</Typography>
              <BatchStatus status={row.status} />
            </Stack>
            <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' }, gap: 2 }}>
              {fields.map(([label, value]) => <Box key={label} sx={{ minWidth: 0 }}>
                <Typography component="dt" variant="caption" color="text.secondary">{label}</Typography>
                <Typography component="dd" variant="body2" sx={{ m: 0, overflowWrap: 'anywhere', fontWeight: 600 }}>{value}</Typography>
              </Box>)}
            </Box>
            <Typography variant="body2" aria-live="polite">
              {text.counts(row.counts.ready, row.counts.pending, row.counts.settled, row.counts.failed)}
            </Typography>
            <FinancialTotals values={row.settledTotals} />
          </Stack>
        </Paper>
      </Box>

      <Box role="tabpanel" id={panelId('receivables')} aria-labelledby={tabId('receivables')} hidden={activeTab !== 'receivables'}
        sx={{ minWidth: 0, minHeight: 0, flex: 1, display: activeTab === 'receivables' ? 'flex' : 'none',
          flexDirection: 'column', overflow: 'hidden' }}>
        {items.data && <FailedReceivablesTable batch={row} rows={items.data.items} totalItems={items.data.totalItems} active={activeTab === 'receivables'}
          pagination={{ ...filters, disabled: items.isFetching }}
          onPageChange={next => setParams(current => {
            const updated = new URLSearchParams(current);
            updated.set('page', String(next.page)); updated.set('size', String(next.size));
            return updated;
          }, { preventScrollReset: true })}
          onRefresh={() => { void items.refetch(); }} onViewFailure={openFailure} />}
      </Box>

      <Box role="tabpanel" id={panelId('requests')} aria-labelledby={tabId('requests')} hidden={activeTab !== 'requests'}
        sx={{ display: activeTab === 'requests' ? 'block' : 'none', minWidth: 0, minHeight: 0, flex: 1,
          overflowY: { xs: 'visible', md: 'auto' } }}>
        <SettlementFlow batch={row} available={!detail.isError && !detail.isFetching} active={activeTab === 'requests'} receivablesVisible={activeTab === 'receivables'} />
      </Box>

      <Box role="tabpanel" id={panelId('audit')} aria-labelledby={tabId('audit')} hidden={activeTab !== 'audit'}
        sx={{ minWidth: 0, minHeight: 0, flex: 1, display: activeTab === 'audit' ? 'flex' : 'none',
          flexDirection: 'column', overflow: 'hidden' }}>
        <BatchAuditTab batchUuid={row.uuid} active={activeTab === 'audit'} receivableUuid={params.get('auditReceivableUuid') ?? undefined} />
      </Box>
    </>}

    {selectedFailure && <AppDialog open={failureDialogOpen} title={text.errorTitle(selectedFailure.reference)}
      onClose={() => setFailureDialogOpen(false)} onExited={finishFailureDialog} closeLabel={translations[locale].common.understood}
      closeVariant="text" actions={<Button onClick={() => {
        changeTab('audit', selectedFailure.uuid);
        setFailureDialogOpen(false);
      }}>{text.auditAccess}</Button>}>
      <Stack spacing={1.5} sx={{ py: 1 }}>
        <Typography sx={{ overflowWrap: 'anywhere' }}>{selectedFailure.failure.message}</Typography>
        <Typography variant="body2">{text.errorStage}: {translations[locale].settlement.audit.stage[selectedFailure.failure.stage]}</Typography>
        <Typography variant="body2">{text.errorOccurredAt}: {formatInstant(selectedFailure.failure.occurredAt)}</Typography>
        <Typography variant="caption" color="text.secondary">{text.errorCode}: {selectedFailure.failure.code}</Typography>
      </Stack>
    </AppDialog>}
  </Stack>;
}
