import { Chip } from '@mui/material';
import type { BatchDetail } from '../services/contracts';
import { translations, locale } from '../../i18n/pt-BR';
const colors = { READY: 'info', PENDING: 'warning', SETTLED: 'success', FAILED: 'error' } as const;
export function BatchStatus({ status }: { status: BatchDetail['status'] }) {
  return <Chip size="small" variant="outlined" color={colors[status]} label={translations[locale].batch.statuses[status]} />;
}
