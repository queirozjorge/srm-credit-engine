import { useEffect, useRef, useState } from 'react';
import { Box, Stack, useMediaQuery } from '@mui/material';
import { DataTable } from '../../common/components/DataTable';
import { TableActionButton } from '../../common/components/TableActionButton';
import { formatDecimal, moneyFormat } from '../../common/format/decimal';
import { formatCivilDate } from '../../common/format/dates';
import { locale, translations } from '../../i18n/pt-BR';
import type { DraftItem } from '../services/manualBatch';
export function DraftReceivables({ items, editable, onEdit, onRemove, compact = false }: {
  items: DraftItem[]; editable: boolean; onEdit: (item: DraftItem) => void; onRemove: (id: string) => void; compact?: boolean;
}) {
  const text = translations[locale].batch; const region = useRef<HTMLDivElement>(null);
  const desktop = useMediaQuery(theme => theme.breakpoints.up('md'));
  const [pagination, setPagination] = useState({ page: 1, size: 5 }); const [measuredCapacity, setMeasuredCapacity] = useState(5);
  const [hasCustomSize, setHasCustomSize] = useState(false);
  const capacity = compact || !desktop ? 5 : measuredCapacity;
  useEffect(() => {
    if (compact || !desktop) return;
    const element = region.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(entries => {
      const height = entries[0]?.contentRect.height ?? element.clientHeight;
      // Reserve room for the header, pagination controls and vertical cell padding.
      const nextCapacity = Math.max(1, Math.min(50, Math.floor((height - 112) / 48)));
      setMeasuredCapacity(current => current === nextCapacity ? current : nextCapacity);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [compact, desktop]);
  const size = hasCustomSize ? pagination.size : capacity;
  const requestedPage = !hasCustomSize && pagination.size !== capacity ? 1 : pagination.page;
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(items.length / size)));
  const pageSizes = [...new Set([capacity, 5, 10, 20, 50])].sort((left, right) => left - right);
  return <Box ref={region} sx={{ gridArea: 'receivables', minWidth: 0, minHeight: compact ? 'auto' : { xs: 'auto', md: 0 },
    display: compact ? 'block' : 'flex', overflow: compact ? 'visible' : { xs: 'visible', md: 'hidden' } }}>
    <DataTable label={text.manual.draftTable} rows={items.slice((page - 1) * size, page * size)} getRowKey={row => row.localId}
    fillHeight={!compact} maxHeight={compact ? 'none' : undefined} emptyMessage={text.manual.empty} columns={[
      { id: 'assignor', label: text.manual.assignor, render: row => row.assignorName },
      { id: 'reference', label: text.reference, render: row => <span style={{ overflowWrap: 'anywhere' }}>{row.externalReference}</span> },
      { id: 'type', label: text.type, render: row => text.types[row.type] },
      { id: 'amount', label: text.faceValue, render: row => formatDecimal(row.faceValueBrl, moneyFormat), align: 'right' },
      { id: 'due', label: text.dueDate, render: row => formatCivilDate(row.dueDate) },
      { id: 'currency', label: text.currency, render: row => text.currencies[row.paymentCurrency] },
      ...(editable ? [{ id: 'actions', label: text.actions, align: 'center' as const, render: (row: DraftItem) => <Stack direction="row">
        <TableActionButton label={text.manual.editItem} icon="edit" onClick={() => onEdit(row)} />
        <TableActionButton label={text.manual.removeItem} icon="remove" onClick={() => onRemove(row.localId)} />
      </Stack> }] : []),
    ]} pagination={{ ...pagination, page, size, pageSizes, totalItems: items.length, onChange: next => {
      if (next.size !== size) setHasCustomSize(true);
      setPagination(next);
    } }} />
  </Box>;
}
