import type { ReactNode } from 'react';
import { Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import { locale, translations } from '../../i18n/pt-BR';
import { TablePaginationControls, type TablePaginationProps } from './TablePaginationControls';

export interface TableColumn<T> { id: string; label: string; render: (row: T) => ReactNode; align?: 'left' | 'right'; }
export interface DataTableProps<T> {
  label: string; rows: readonly T[]; columns: readonly TableColumn<T>[]; getRowKey: (row: T) => string;
  pagination: TablePaginationProps; emptyMessage?: string; maxHeight?: number | string;
}

export function DataTable<T>({ label, rows, columns, getRowKey, pagination,
  emptyMessage = translations[locale].common.empty, maxHeight = 'min(55dvh, 640px)' }: DataTableProps<T>) {
  return (
    <Paper variant="outlined" sx={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <TableContainer tabIndex={0} role="region" aria-label={label} sx={{ maxHeight, overflow: 'auto', minHeight: 0 }}>
        <Table stickyHeader size="small" aria-label={label} sx={{ minWidth: 600 }}>
          <TableHead><TableRow>{columns.map((column) =>
            <TableCell key={column.id} scope="col" align={column.align}>{column.label}</TableCell>,
          )}</TableRow></TableHead>
          <TableBody>{rows.length ? rows.map((row) =>
            <TableRow key={getRowKey(row)}>{columns.map((column) =>
              <TableCell key={column.id} align={column.align}>{column.render(row)}</TableCell>,
            )}</TableRow>,
          ) : <TableRow><TableCell colSpan={columns.length}>{emptyMessage}</TableCell></TableRow>}</TableBody>
        </Table>
      </TableContainer>
      <TablePaginationControls {...pagination} />
    </Paper>
  );
}
