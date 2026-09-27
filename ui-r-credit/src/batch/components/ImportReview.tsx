import { useState } from 'react';
import { MenuItem, TextField, Typography } from '@mui/material';
import { DataTable } from '../../common/components/DataTable';
import { formatDecimal, moneyFormat } from '../../common/format/decimal';
import { formatCivilDate } from '../../common/format/dates';
import { locale, translations } from '../../i18n/pt-BR';
import type { ImportPreview } from '../services/importBatch';
export function ImportReview({ preview, editable, currencies, onCurrency }: {
  preview: ImportPreview; editable: boolean; currencies: Record<number, 'BRL' | 'USD'>; onCurrency: (index: number, currency: 'BRL' | 'USD') => void;
}) {
  const text = translations[locale].batch; const [pagination, setPagination] = useState({ page: 1, size: 5 });
  const page = Math.min(pagination.page, Math.max(1, Math.ceil(preview.items.length / pagination.size)));
  return <DataTable label={text.import.table} rows={preview.items.slice((page - 1) * pagination.size, page * pagination.size)}
    getRowKey={row => `${row.itemIndex}-${row.line}`} maxHeight={360} emptyMessage={text.import.noPreview} columns={[
      { id: 'line', label: text.import.line, render: row => row.line },
      { id: 'assignor', label: text.manual.assignor, render: row => row.assignorName },
      { id: 'reference', label: text.reference, render: row => <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{row.externalReference}</Typography> },
      { id: 'type', label: text.type, render: row => text.types[row.type] },
      { id: 'value', label: text.faceValue, render: row => formatDecimal(row.faceValueBrl, moneyFormat), align: 'right' },
      { id: 'due', label: text.dueDate, render: row => formatCivilDate(row.dueDate) },
      { id: 'currency', label: text.currency, render: row => preview.source === 'CNAB' ? <TextField select size="small" label={text.import.currencyFor(row.line)}
        value={currencies[row.itemIndex] ?? row.paymentCurrency} disabled={!editable} sx={{ minWidth: 150 }} onChange={event => {
          if (event.target.value === 'BRL' || event.target.value === 'USD') onCurrency(row.itemIndex, event.target.value);
        }}>{Object.entries(text.currencies).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField> : text.currencies[row.paymentCurrency] },
    ]} pagination={{ ...pagination, page, totalItems: preview.items.length, onChange: setPagination }} />;
}
