import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Box, Button, Checkbox, Chip, Stack, TextField, Typography } from '@mui/material';
import { AppDialog } from '../../common/components/AppDialog';
import { DataTable } from '../../common/components/DataTable';
import { formatCivilDate, formatInstant } from '../../common/format/dates';
import { formatDecimal, moneyFormat, rateFormat } from '../../common/format/decimal';
import { can } from '../../auth/services/session';
import { useSession } from '../../auth/services/sessionContext';
import { locale, translations } from '../../i18n/pt-BR';
import { useReprocessSettlement } from '../../settlement/services/useReprocessSettlement';
import type { ReprocessAttempt } from '../../settlement/services/useReprocessSettlement';
import type { ItemFailure } from '../../settlement/services/contracts';
import { useSimulation } from '../../pricing/services/useSimulation';
import { FinancialTotals } from '../../common/components/FinancialTotals';
import type { BatchDetail } from '../services/contracts';
import type { Receivable } from '../services/receivableContracts';
import type { PaginationState, TablePaginationProps } from '../../common/components/TablePaginationControls';

interface SelectedReceivable {
  uuid: string;
  reference: string;
  attemptNumber: number;
}

interface FailedReceivablesTableProps {
  batch: BatchDetail;
  rows: readonly Receivable[];
  totalItems: number;
  pagination: Omit<TablePaginationProps, 'totalItems' | 'onChange'>;
  onPageChange: (next: PaginationState) => void;
  onRefresh: () => void;
  onViewFailure: (uuid: string, reference: string, failure: ItemFailure) => void;
  active: boolean;
}

export function FailedReceivablesTable({ batch, rows, totalItems, pagination, onPageChange, onRefresh, onViewFailure, active }: FailedReceivablesTableProps) {
  const copy = translations[locale].batch;
  const text = copy.reprocess;
  const { identity } = useSession();
  const cache = useQueryClient();
  const authorized = can(identity, 'settle');
  const controller = useReprocessSettlement(batch);
  const [localSelection, setLocalSelection] = useState<SelectedReceivable[] | null>(null);
  const [localReason, setLocalReason] = useState<string | null>(null);
  const [reasonAttempted, setReasonAttempted] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const dialogClosing = useRef(false);

  const rawSelection = localSelection ?? (controller.intent?.receivableUuids.map(uuid => ({
    uuid,
    reference: rows.find(row => row.uuid === uuid)?.externalReference ?? uuid,
    attemptNumber: rows.find(row => row.uuid === uuid)?.processing.attemptNumber ?? 0,
  })) ?? []);
  const visibleStatuses = new Map(rows.map(row => [row.uuid, row.processing.status]));
  const visibleAttempts = new Map(rows.map(row => [row.uuid, row.processing.attemptNumber]));
  const selected = rawSelection.filter(item => controller.uncertain || !active || !visibleStatuses.has(item.uuid)
    || (visibleStatuses.get(item.uuid) === 'FAILED' && visibleAttempts.get(item.uuid) === item.attemptNumber));
  const selectedIds = new Set(selected.map(item => item.uuid));
  const stateKey = ['settlement', 'reprocess-attempt', batch.uuid] as const;
  const reason = localReason ?? controller.intent?.reason ?? '';
  const normalizedReason = reason.trim();
  const reasonInvalid = normalizedReason.length < 1 || normalizedReason.length > 500;
  const selectDisabled = controller.pending || controller.uncertain;

  const simulationUuids = selected.map(item => item.uuid).sort();
  const simulation = useSimulation(
    selected.length ? { batchUuid: batch.uuid, receivableUuids: simulationUuids } : null,
    dialogOpen && authorized && controller.canSubmit && !controller.pending && !controller.uncertain,
    `${batch.uuid}:${batch.progressVersion}`,
    selected.length,
  );

  function toggle(item: Receivable, checked: boolean) {
    if (!authorized || selectDisabled || (checked && item.processing.status !== 'FAILED')) return;
    const current = selected;
    setLocalSelection(checked
      ? [...current.filter(entry => entry.uuid !== item.uuid), { uuid: item.uuid, reference: item.externalReference, attemptNumber: item.processing.attemptNumber }]
      : current.filter(entry => entry.uuid !== item.uuid));
  }

  function completeIntent() {
    controller.clearIntent();
    setLocalSelection([]);
    setLocalReason('');
    setReasonAttempted(false);
    closeDialog();
    onRefresh();
  }

  function openDialog() {
    if (!dialogClosing.current) setDialogOpen(true);
  }

  function closeDialog() {
    if (dialogClosing.current) return;
    dialogClosing.current = true;
    setDialogOpen(false);
  }

  async function submit() {
    if (!authorized || !controller.canSubmit || selected.length === 0) return;
    setReasonAttempted(true);
    if (reasonInvalid) return;
    const accepted = await controller.submit({ receivableUuids: selected.map(item => item.uuid), reason: normalizedReason });
    if (accepted) completeIntent();
    else if (cache.getQueryData<ReprocessAttempt>(stateKey)?.requestUuid) onRefresh();
  }

  async function repeat() {
    if (await controller.repeat()) completeIntent();
    else if (cache.getQueryData<ReprocessAttempt>(stateKey)?.requestUuid) onRefresh();
  }

  async function reconcile() {
    const reconciled = await controller.reconcile();
    if (reconciled) onRefresh();
  }

  const failureCount = selected.length;
  const columns = [
    ...(authorized ? [{ id: 'reprocess', label: text.selectionColumn, render: (item: Receivable) => {
      const selectedItem = selectedIds.has(item.uuid);
      const eligible = item.processing.status === 'FAILED';
      return <Checkbox checked={selectedItem} disabled={selectDisabled || (!eligible && !selectedItem)}
        onChange={event => toggle(item, event.target.checked)}
        inputProps={{ 'aria-label': text.selectTitle(item.externalReference, eligible) }} />;
    } }] : []),
    { id: 'reference', label: copy.reference, render: (item: Receivable) => <Typography variant="body2" sx={{ overflowWrap: 'anywhere', maxWidth: 220 }}>{item.externalReference}</Typography> },
    { id: 'assignor', label: copy.assignors, render: (item: Receivable) => item.assignorName },
    { id: 'type', label: copy.type, render: (item: Receivable) => copy.types[item.type] },
    { id: 'amount', label: copy.faceValue, render: (item: Receivable) => formatDecimal(item.faceValueBrl, moneyFormat), align: 'right' as const },
    { id: 'due', label: copy.dueDate, render: (item: Receivable) => formatCivilDate(item.dueDate) },
    { id: 'currency', label: copy.currency, render: (item: Receivable) => copy.currencies[item.paymentCurrency] },
    { id: 'processing', label: copy.status, render: (item: Receivable) => <Stack spacing={0.5} alignItems="flex-start">
      <Typography variant="body2">{copy.statuses[item.processing.status]}</Typography>
      {item.processing.hasError && <Chip size="small" color="error" variant="outlined" label={copy.errorFlag} />}
      {item.processing.failure && <Button size="small" onClick={() => onViewFailure(item.uuid, item.externalReference, item.processing.failure!)}>{copy.failure}</Button>}
    </Stack> },
  ];

  return <Stack spacing={1.5} sx={{ minWidth: 0 }}>
    <Stack direction={{ xs: 'column', sm: 'row' }} useFlexGap flexWrap="wrap" alignItems={{ sm: 'center' }} justifyContent="space-between" gap={1}>
      <Typography component="h2" variant="h2">{copy.receivables}</Typography>
      <Stack direction="row" useFlexGap flexWrap="wrap" gap={1}>
        {authorized && <Button variant="contained" disabled={controller.pending || (!controller.uncertain && (!controller.canSubmit || failureCount === 0))}
          onClick={openDialog}>
          {controller.uncertain ? text.resume : text.action(failureCount)}
        </Button>}
        <Button disabled={pagination.disabled} onClick={onRefresh}>{copy.refreshItems}</Button>
      </Stack>
    </Stack>
    {batch.status === 'PENDING' && authorized && <Typography variant="body2" color="text.secondary" role="status">{text.pendingBatch}</Typography>}
    <DataTable label={copy.receivables} rows={rows} getRowKey={item => item.uuid} emptyMessage={copy.emptyItems}
      maxHeight="clamp(160px, calc(100dvh - 640px), 500px)" columns={columns}
      pagination={{ ...pagination, totalItems, onChange: onPageChange }} />

    {authorized && <AppDialog open={dialogOpen} title={text.confirmTitle} onClose={closeDialog} onExited={() => { dialogClosing.current = false; }}
      closeLabel={text.cancel} closeDisabled={controller.pending} actions={controller.uncertain ? <>
        <Button onClick={() => { void reconcile(); }} disabled={controller.pending} variant="outlined">{text.reconcile}</Button>
        <Button onClick={() => { void repeat(); }} disabled={controller.pending} variant="contained">{text.repeat}</Button>
      </> : <Button onClick={() => { void submit(); }} disabled={controller.pending || !controller.canSubmit || failureCount === 0} variant="contained">{text.confirm}</Button>}>
      <Stack spacing={2} sx={{ py: 1 }}>
        <Typography>{text.review(failureCount)}</Typography>
        <Box component="ul" aria-label={text.selectedTitles} sx={{ m: 0, pl: 3, maxHeight: 180, overflow: 'auto' }}>
          {selected.map(item => <Box component="li" key={item.uuid} sx={{ overflowWrap: 'anywhere', mb: 0.75 }}>
            <Typography variant="body2">{item.reference} · {item.uuid}</Typography>
          </Box>)}
        </Box>
        <TextField label={text.justification} value={reason} required multiline minRows={3} fullWidth
          disabled={controller.pending || controller.uncertain}
          onChange={event => { setLocalReason(event.target.value); setReasonAttempted(false); }}
          error={reasonAttempted && reasonInvalid} helperText={reasonAttempted && reasonInvalid ? text.justificationInvalid : text.justificationHint}
          slotProps={{ htmlInput: { maxLength: 500, 'aria-label': text.justification } }} />
        <Typography variant="body2" color="text.secondary">{text.consequence}</Typography>
        {controller.uncertain && <Typography variant="body2" role="status">{text.uncertain}</Typography>}
        <Stack spacing={1} aria-label={text.simulationTitle}>
          <Typography component="h3" variant="h3">{text.simulationTitle}</Typography>
          <Typography variant="body2" color="text.secondary">{text.simulationHint}</Typography>
          {simulation.updating && <Typography role="status" variant="body2">{translations[locale].pricing.updating}</Typography>}
          {simulation.data && <>
            <Typography variant="body2" role="status">{simulation.valid ? text.simulationCurrent : text.simulationStale}</Typography>
            <Typography variant="body2">{translations[locale].pricing.calculated(
              formatInstant(simulation.data.calculatedAt),
              simulation.data.calculationDate,
              formatDecimal(simulation.data.baseRate, rateFormat),
            )}</Typography>
            {simulation.data.exchangeRate && <Typography variant="body2">
              {translations[locale].pricing.exchange(formatDecimal(simulation.data.exchangeRate.rate, rateFormat), formatInstant(simulation.data.exchangeRate.validUntil))}
            </Typography>}
            <FinancialTotals values={simulation.data.totals} />
            <Box component="ul" aria-label={translations[locale].pricing.items} sx={{ m: 0, p: 1.25, maxHeight: 180, overflow: 'auto', border: 1, borderColor: 'divider', borderRadius: 1 }}>
              {simulation.data.items.map((item, index) => {
                const reference = selected.find(entry => entry.uuid === item.receivableUuid)?.reference ?? item.receivableUuid ?? String(index + 1);
                return <Box component="li" key={item.receivableUuid ?? item.itemIndex} sx={{ listStyle: 'none', py: 0.75, borderBottom: 1, borderColor: 'divider' }}>
                  <Typography variant="body2" sx={{ overflowWrap: 'anywhere', fontWeight: 600 }}>{reference}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {translations[locale].pricing.days}: {item.days.toLocaleString('pt-BR')} · {translations[locale].pricing.termMonths}: {item.termMonths} · {translations[locale].pricing.spread}: {formatDecimal(item.spread, rateFormat)} · {translations[locale].pricing.present}: R$ {formatDecimal(item.presentValueBrl, moneyFormat)} · {translations[locale].pricing.payment}: {item.paymentCurrency} {formatDecimal(item.paymentValue, moneyFormat)}
                  </Typography>
                </Box>;
              })}
            </Box>
          </>}
        </Stack>
      </Stack>
    </AppDialog>}
  </Stack>;
}
