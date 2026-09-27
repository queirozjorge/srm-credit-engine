import { Box, Typography } from '@mui/material';
import { AppDialog } from '../../common/components/AppDialog';
import { SimulationPanel } from '../../pricing/components/SimulationPanel';
import type { SimulationInput } from '../../pricing/services/useSimulation';
import type { DraftItem } from '../services/manualBatch';
import { DraftReceivables } from './DraftReceivables';

export interface ManualBatchPreviewDialogProps {
  type: 'receivables' | 'simulation';
  title: string;
  open: boolean;
  onClose: () => void;
  onExited: () => void;
  items: DraftItem[];
  editable: boolean;
  onEdit: (item: DraftItem) => void;
  onRemove: (id: string) => void;
  simulationInput: SimulationInput | null;
  simulationUnavailableText: string;
}

export function ManualBatchPreviewDialog({ type, title, open, onClose, onExited, items, editable, onEdit, onRemove,
  simulationInput, simulationUnavailableText }: ManualBatchPreviewDialogProps) {
  return (
    <AppDialog open={open} title={title} maxWidth="lg" onClose={onClose} onExited={onExited}>
      {type === 'receivables' ? (
        <Box sx={{
          minWidth: 0,
          '& > .MuiBox-root': { minHeight: 'auto', overflow: 'visible' },
          '& .MuiPaper-root': {
            flex: '0 1 auto',
            minWidth: 0,
            minHeight: 'auto',
          },
          '& .MuiTableContainer-root': {
            flex: '0 1 auto',
            minHeight: 'auto',
            maxHeight: 'none',
            overflowX: 'auto',
            overflowY: 'visible',
          },
        }}>
          <DraftReceivables compact items={items} editable={editable} onEdit={onEdit} onRemove={onRemove} />
        </Box>
      ) : (
        <Box sx={{ maxHeight: 'min(68dvh, 680px)', minWidth: 0, overflowY: 'auto' }}>
          {simulationInput
            ? <SimulationPanel input={simulationInput} enabled autoStart />
            : <Typography variant="body2" color="text.secondary">{simulationUnavailableText}</Typography>}
        </Box>
      )}
    </AppDialog>
  );
}
