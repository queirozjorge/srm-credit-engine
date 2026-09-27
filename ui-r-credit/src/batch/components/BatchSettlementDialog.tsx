import { useQueryClient } from '@tanstack/react-query';
import { Button, Stack, Typography } from '@mui/material';
import { AppDialog } from '../../common/components/AppDialog';
import { useSession } from '../../auth/services/sessionContext';
import { can } from '../../auth/services/session';
import { locale, translations } from '../../i18n/pt-BR';
import type { BatchDetail, BatchSummary } from '../services/contracts';
import { useSettlement } from '../../settlement/services/useSettlement';

export function BatchSettlementDialog({ batch, open, onClose, onExited }: {
  batch: BatchSummary;
  open: boolean;
  onClose: () => void;
  onExited: () => void;
}) {
  const queryClient = useQueryClient();
  const { identity } = useSession();
  const text = translations[locale].settlement.flow;
  const operation = useSettlement(batch);
  const allowed = can(identity, 'settle') && batch.status === 'READY';

  async function refreshAndClose() {
    await queryClient.invalidateQueries({ queryKey: ['batches', 'list'], refetchType: 'active' });
    onClose();
  }

  async function closeIfNoLongerReady() {
    const latest = queryClient.getQueryData<BatchDetail>(['batches', 'detail', batch.uuid]);
    if (latest && latest.status !== 'READY') await refreshAndClose();
  }

  async function confirm() {
    if (!open || !allowed || operation.pending || (operation.uncertain && !operation.checked)) return;
    if (await operation.submit()) await refreshAndClose();
    else await closeIfNoLongerReady();
  }

  async function reconcile() {
    await operation.reconcile();
    await closeIfNoLongerReady();
  }

  return <AppDialog open={open} title={text.confirmTitle} onClose={onClose} onExited={onExited}
    closeDisabled={operation.pending} closeLabel={text.cancel} closeVariant="text"
    actions={<>
      {operation.uncertain && <Button disabled={operation.pending} onClick={() => { void reconcile(); }}>{text.reconcile}</Button>}
      {operation.uncertain && operation.checked && allowed && <Button disabled={operation.pending} onClick={() => { void confirm(); }}>{text.repeat}</Button>}
      {!operation.uncertain && <Button variant="contained" disabled={!open || !allowed || operation.pending}
        onClick={() => { void confirm(); }}>{text.confirm}</Button>}
    </>}>
    <Stack spacing={2} sx={{ py: 1 }}>
      <Typography sx={{ overflowWrap: 'anywhere' }}>{text.scope(batch.uuid, batch.itemCount)}</Typography>
      <Typography>{text.consequence}</Typography>
      {operation.uncertain && <Typography role="status" color="text.secondary">{text.uncertain}</Typography>}
    </Stack>
  </AppDialog>;
}
