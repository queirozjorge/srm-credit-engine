import { useId, useState } from 'react';
import { Box, Button, Stack, TablePagination, TextField, Typography } from '@mui/material';
import { locale, translations } from '../../i18n/pt-BR';

export interface PaginationState { page: number; size: number }
export interface TablePaginationProps extends PaginationState {
  totalItems: number;
  pageSizes?: number[];
  disabled?: boolean;
  onChange: (next: PaginationState) => void;
}

function NoActions() { return null; }

export function TablePaginationControls({ page, size, totalItems, pageSizes = [5, 10, 20, 50], disabled = false,
  onChange }: TablePaginationProps) {
  const text = translations[locale].common.pagination;
  const id = useId();
  const totalPages = Math.ceil(totalItems / size);
  const [jump, setJump] = useState('');
  const [attempted, setAttempted] = useState(false);
  const requested = /^\d+$/.test(jump) ? Number(jump) : NaN;
  const valid = Number.isSafeInteger(requested) && requested >= 1 && requested <= totalPages;
  const invalid = attempted && !valid;
  const from = totalItems === 0 || page > totalPages ? 0 : (page - 1) * size + 1;
  return (
    <Box component="nav" aria-label={text.label} sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
      <TablePagination component="div" count={totalItems} rowsPerPage={size}
        page={Math.max(0, Math.min(page - 1, totalPages - 1))} rowsPerPageOptions={pageSizes} disabled={disabled}
        labelRowsPerPage={text.size} labelDisplayedRows={() => text.range(from, from ? Math.min(page * size, totalItems) : 0, totalItems)}
        onPageChange={(_, next) => onChange({ page: next + 1, size })}
        onRowsPerPageChange={(event) => { setAttempted(false); setJump(''); onChange({ page: 1, size: Number(event.target.value) }); }}
        ActionsComponent={NoActions}
        sx={{ overflow: 'visible', '& .MuiTablePagination-toolbar': { flexWrap: 'wrap', gap: 1, p: 0 },
          '& .MuiTablePagination-spacer': { display: 'none' }, '& .MuiTablePagination-selectLabel': { display: 'block' },
          '& .MuiTablePagination-displayedRows': { m: 0 } }} />
      <Stack direction="row" useFlexGap flexWrap="wrap" alignItems="center" gap={2}>
        <Typography variant="body2" role="status">{text.page(page, totalPages)}</Typography>
        <Stack component="form" direction="row" alignItems="flex-start" spacing={1} noValidate
          onSubmit={(event) => {
            event.preventDefault(); setAttempted(true);
            if (!valid || disabled || requested === page) return;
            onChange({ page: requested, size });
          }}>
          <TextField id={id} size="small" label={text.jump} value={jump} disabled={disabled || totalPages === 0}
            onChange={(event) => { setJump(event.target.value); setAttempted(false); }}
            error={invalid} helperText={invalid ? text.invalid(totalPages) : undefined}
            slotProps={{ htmlInput: { inputMode: 'numeric' } }} sx={{ width: 160 }} />
          <Button type="submit" variant="outlined" disabled={disabled || totalPages === 0}>{text.go}</Button>
        </Stack>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
          <Button disabled={disabled || page <= 1} onClick={() => onChange({ page: page - 1, size })}>{text.previous}</Button>
          <Button disabled={disabled || page >= totalPages} onClick={() => onChange({ page: page + 1, size })}>{text.next}</Button>
        </Stack>
      </Stack>
    </Box>
  );
}
