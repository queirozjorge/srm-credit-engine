import { Button, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { useSession } from '../../auth/services/sessionContext';
import { actorDisplayName } from '../../auth/services/session';
import { DataTable } from '../../common/components/DataTable';
import { useAppFeedback } from '../../common/components/feedbackContext';
import { formatInstant } from '../../common/format/dates';
import { pageOf } from '../../common/http/contracts';
import { useApiClient } from '../../common/http/useApiClient';
import { locale, translations } from '../../i18n/pt-BR';
import { pagination } from '../../batch/services/useBatches';
import { auditEventSchema, type AuditEvent } from '../services/contracts';

const auditPageSchema = pageOf(auditEventSchema);

function eventDetails(event: AuditEvent, copy: typeof translations['pt-BR']['settlement']['audit']): string {
  switch (event.eventType) {
    case 'BATCH_CREATED': return copy.created(event.details.itemCount);
    case 'SETTLEMENT_REQUESTED': return copy.requested(event.details.receivableUuids.length);
    case 'SETTLEMENT_REPROCESS_REQUESTED': return copy.reprocessed(event.details.receivableUuids.length, event.details.reason);
    case 'RECEIVABLE_ATTEMPT_ACCEPTED': return copy.accepted(event.details.attemptNumber, event.details.termDays);
    case 'RECEIVABLE_ATTEMPT_REJECTED': return copy.rejected(event.details.failure.message);
    case 'RECEIVABLE_PROCESSING_RETRY_SCHEDULED': return copy.retryScheduled(event.details.retryNumber, formatInstant(event.details.nextRetryAt));
    case 'RECEIVABLE_PROCESSING_ATTEMPT_FAILED': return copy.attemptFailed(event.details.retryNumber, event.details.failure.message);
    case 'RECEIVABLE_SETTLED': return copy.settled;
    case 'RECEIVABLE_SETTLEMENT_FAILED': return copy.settlementFailed(event.details.retryCount, event.details.failure.message);
  }
}

export function BatchAuditTab({ batchUuid, active, receivableUuid }: { batchUuid: string; active: boolean; receivableUuid?: string }) {
  const copy = translations[locale].settlement.audit;
  const { identity } = useSession();
  const [params, setParams] = useSearchParams();
  const api = useApiClient();
  const { beginLoading } = useAppFeedback();
  const filters = pagination(new URLSearchParams({ page: params.get('auditPage') ?? '1', size: params.get('auditSize') ?? '20' }));
  const events = useQuery({
    queryKey: ['settlement', 'audit', batchUuid, filters, receivableUuid], enabled: active,
    queryFn: async ({ signal }) => {
      const end = beginLoading();
      try {
        return (await api.request(`/api/batches/${batchUuid}/audit-events`, { schema: auditPageSchema,
          query: { ...filters, receivableUuid }, signal })).data;
      } finally { end(); }
    },
    placeholderData: (previous, query) => query?.queryKey[2] === batchUuid ? previous : undefined,
  });

  function changePage(next: { page: number; size: number }) {
    setParams(current => {
      const updated = new URLSearchParams(current);
      updated.set('auditPage', String(next.page));
      updated.set('auditSize', String(next.size));
      return updated;
    }, { preventScrollReset: true });
  }

  function clearFilter() {
    setParams(current => {
      const updated = new URLSearchParams(current);
      updated.delete('auditReceivableUuid');
      updated.set('auditPage', '1');
      return updated;
    }, { preventScrollReset: true });
  }

  return <Stack spacing={1.5} sx={{ minWidth: 0, minHeight: 0, flex: 1, overflow: 'hidden' }}>
    <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
      <Typography component="h2" variant="h2">{copy.title}</Typography>
      <Stack direction="row" gap={1} useFlexGap flexWrap="wrap">
        {receivableUuid && <Button onClick={clearFilter}>{copy.clearFilter}</Button>}
      </Stack>
    </Stack>
    {receivableUuid && <Typography variant="body2" color="text.secondary">{copy.filtered}</Typography>}
    {events.data && <DataTable label={copy.title} rows={events.data.items} getRowKey={event => event.uuid}
      emptyMessage={copy.empty} fillHeight columns={[
        { id: 'registeredAt', label: copy.registeredAt, render: event => formatInstant(event.registeredAt) },
        { id: 'event', label: copy.event, render: event => translations[locale].settlement.audit.eventTypes[event.eventType] },
        { id: 'actor', label: copy.actor, render: event => actorDisplayName(event.actor, identity, translations[locale].common.unknownUser) },
        { id: 'receivable', label: copy.receivable, render: event => event.receivableUuid ?? copy.noReceivable },
        { id: 'details', label: copy.details, render: event => <Typography variant="body2" sx={{ minWidth: 240, maxWidth: 520, overflowWrap: 'anywhere' }}>{eventDetails(event, copy)}</Typography> },
      ]} pagination={{ ...filters, totalItems: events.data.totalItems, disabled: events.isFetching, onChange: changePage }} />}
  </Stack>;
}
