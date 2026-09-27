import { useState } from 'react';
import { Button, Stack } from '@mui/material';
import { DataTable } from '../../common/components/DataTable';
import { formatDecimal, moneyFormat } from '../../common/format/decimal';
import { formatCivilDate } from '../../common/format/dates';
import { locale, translations } from '../../i18n/pt-BR';
import type { DraftItem } from '../services/manualBatch';
export function DraftReceivables({ items, editable, onEdit, onRemove }: {
  items: DraftItem[]; editable: boolean; onEdit: (item: DraftItem) => void; onRemove: (id: string) => void;
}) {
  const text = translations[locale].batch; const [pagination, setPagination] = useState({ page: 1, size: 5 });
  const page = Math.min(pagination.page, Math.max(1, Math.ceil(items.length / pagination.size)));
  return <DataTable label={text.manual.draftTable} rows={items.slice((page - 1) * pagination.size, page * pagination.size)} getRowKey={row => row.localId}
    maxHeight={360} emptyMessage={text.manual.empty} columns={[
      { id: 'assignor', label: text.manual.assignor, render: row => row.assignorName },
      { id: 'reference', label: text.reference, render: row => <span style={{ overflowWrap: 'anywhere' }}>{row.externalReference}</span> },
      { id: 'type', label: text.type, render: row => text.types[row.type] },
      { id: 'amount', label: text.faceValue, render: row => formatDecimal(row.faceValueBrl, moneyFormat), align: 'right' },
      { id: 'due', label: text.dueDate, render: row => formatCivilDate(row.dueDate) },
      { id: 'currency', label: text.currency, render: row => text.currencies[row.paymentCurrency] },
      ...(editable ? [{ id: 'actions', label: text.actions, render: (row: DraftItem) => <Stack direction="row">
        <Button onClick={() => onEdit(row)}>{text.manual.editItem}</Button><Button onClick={() => onRemove(row.localId)}>{text.manual.removeItem}</Button>
      </Stack> }] : []),
    ]} pagination={{ ...pagination, page, totalItems: items.length, onChange: setPagination }} />;
}
