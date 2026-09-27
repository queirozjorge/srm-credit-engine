import { useLocation } from 'react-router';
import { RequestHistory } from './RequestHistory';
import { Box, Stack, Typography } from '@mui/material';
import { useSession } from '../../auth/services/sessionContext';
import { can } from '../../auth/services/session';
import { SimulationPanel } from '../../pricing/components/SimulationPanel';
import type { BatchDetail } from '../../batch/services/contracts';
import { useSettlementPolling } from '../services/useSettlementPolling';
import { AcceptedRequest } from './AcceptedRequest';
import { locale, translations } from '../../i18n/pt-BR';
export function SettlementFlow({ batch, available, active = true, receivablesVisible = true }: { batch: BatchDetail; available: boolean; active?: boolean; receivablesVisible?: boolean }) {
  const location = useLocation();
  const text = translations[locale].settlement.flow; const { identity } = useSession();
  const updating = useSettlementPolling(batch.activeRequest, receivablesVisible);
  const simulationEnabled = available && batch.status === 'READY';
  return <Stack spacing={2.5} sx={{ minWidth: 0 }}>
    {batch.activeRequest && <RequestHistory batchUuid={batch.uuid} activeRequest={batch.activeRequest} active={active} />}
    {batch.activeRequest && <AcceptedRequest request={batch.activeRequest} active={active} />}
    {updating && <Typography role="status" variant="caption">{text.updating}</Typography>}
    {can(identity, 'simulate') && <Box sx={{ display: batch.status === 'READY' ? 'block' : 'none' }}><SimulationPanel autoStart={active && (location.state as { simulate?: boolean } | null)?.simulate === true} expectedCount={batch.itemCount} scope={`${batch.uuid}:${batch.status}:${batch.activeRequest?.uuid ?? ""}`} input={{ batchUuid: batch.uuid }} enabled={active && simulationEnabled} /></Box>}
  </Stack>;
}
