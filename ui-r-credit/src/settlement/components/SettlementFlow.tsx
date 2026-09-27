import { useLocation } from 'react-router';
import { RequestHistory } from './RequestHistory';
import { useState } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import { useSession } from '../../auth/services/sessionContext';
import { can } from '../../auth/services/session';
import { AppDialog } from '../../common/components/AppDialog';
import { FinancialTotals } from '../../common/components/FinancialTotals';
import { SimulationPanel } from '../../pricing/components/SimulationPanel';
import type { Simulation } from '../../pricing/services/contracts';
import type { BatchDetail } from '../../batch/services/contracts';
import { useSettlement } from '../services/useSettlement';
import { useSettlementPolling } from '../services/useSettlementPolling';
import { AcceptedRequest } from './AcceptedRequest';
import { locale, translations } from '../../i18n/pt-BR';
export function SettlementFlow({ batch, available }: { batch: BatchDetail; available: boolean }) {
  const location = useLocation();
  const text = translations[locale].settlement.flow; const { identity } = useSession(); const operation = useSettlement(batch);
  const updating = useSettlementPolling(batch.activeRequest);
  const [confirmation, setConfirmation] = useState<Simulation | null>(null); const [open, setOpen] = useState(false);
  const allowed = available && can(identity, 'settle') && (batch.status === 'READY' || batch.status === 'FAILED');
  function confirm(simulation: Simulation | null) { if (!simulation || confirmation || !allowed) return; setConfirmation(simulation); setOpen(true); }
  return <Stack spacing={2.5} sx={{ minWidth: 0 }}>
    {batch.activeRequest && <AcceptedRequest request={batch.activeRequest} />}
    {batch.activeRequest && <RequestHistory batchUuid={batch.uuid} />}
    {updating && <Typography role="status" variant="caption">{text.updating}</Typography>}
    {can(identity, 'simulate') && <Box sx={{ display: batch.status === 'READY' || batch.status === 'FAILED' ? 'block' : 'none' }}><SimulationPanel autoStart={(location.state as { simulate?: boolean } | null)?.simulate === true} expectedCount={batch.itemCount} scope={`${batch.uuid}:${batch.status}:${batch.activeRequest?.uuid ?? ""}`} input={{ batchUuid: batch.uuid }} enabled={allowed && !operation.pending && !operation.uncertain}
      action={simulation => <Button variant="contained" disabled={!simulation || !allowed || operation.pending || operation.uncertain} onClick={() => confirm(simulation)}>
        {batch.status === 'FAILED' ? text.retry : text.requestAction}</Button>} /></Box>}
    {operation.uncertain && <Stack direction="row" useFlexGap flexWrap="wrap" gap={1}>
      <Button disabled={operation.pending} onClick={() => { void operation.reconcile(); }}>{text.reconcile}</Button>
      {operation.checked && allowed && <Button disabled={operation.pending} onClick={() => { void operation.submit(); }}>{text.repeat}</Button>}
    </Stack>}
    {confirmation && <AppDialog open={open} title={text.confirmTitle} onClose={() => setOpen(false)} onExited={() => setConfirmation(null)} closeDisabled={operation.pending}
      closeLabel={text.cancel} closeVariant="text" actions={<Button variant="contained" disabled={!open || operation.pending || !allowed || operation.uncertain}
        onClick={() => { void operation.submit().then(accepted => { if (accepted) setOpen(false); }); }}>{text.confirm}</Button>}>
      <Stack spacing={2} sx={{ py: 1 }}><Typography sx={{ overflowWrap: 'anywhere' }}>{text.scope(batch.uuid, batch.itemCount)}</Typography>
        <Typography>{text.consequence}</Typography><FinancialTotals values={confirmation.totals} />
      </Stack>
    </AppDialog>}
  </Stack>;
}
