import { useId } from 'react';
import { Box, Typography } from '@mui/material';
import { locale, translations } from '../../i18n/pt-BR';
import { AppDialog } from './AppDialog';

export interface WarningNotice { title?: string; message: string; details?: string[]; dedupeKey?: string }

export function WarningDialog({ open, notice, onClose, onExited }: {
  open: boolean; notice: WarningNotice; onClose: () => void; onExited: () => void;
}) {
  const descriptionId = useId();
  const text = translations[locale].common;
  return (
    <AppDialog open={open} title={notice.title ?? text.warning} describedBy={descriptionId}
      closeLabel={text.understood} onClose={onClose} onExited={onExited}>
      <Typography id={descriptionId} sx={{ overflowWrap: 'anywhere' }}>{notice.message}</Typography>
      {notice.details && <Box component="ul" sx={{ pl: 3, overflowWrap: 'anywhere' }}>
        {notice.details.map((detail, index) => <li key={index}>{detail}</li>)}
      </Box>}
    </AppDialog>
  );
}
