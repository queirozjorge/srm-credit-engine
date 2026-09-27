import { useId, useState } from 'react';
import { Box, Button, FormControl, IconButton, MenuItem, Select, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { locale, translations } from '../../i18n/pt-BR';

export interface PaginationState { page: number; size: number }
export interface TablePaginationProps extends PaginationState {
  totalItems: number;
  pageSizes?: number[];
  disabled?: boolean;
  onChange: (next: PaginationState) => void;
}

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
  return (
    <Box component="nav" aria-label={text.label} sx={{ px: 2, py: 1.25, borderTop: 1, borderColor: 'divider' }}>
      <Stack direction="row" useFlexGap flexWrap="wrap" justifyContent="center" alignItems="center" gap={1.5}>
        <FormControl size="small" disabled={disabled} sx={{ minWidth: 88 }}>
          <Select value={size} inputProps={{ 'aria-label': text.size }}
            onChange={(event) => { setAttempted(false); setJump(''); onChange({ page: 1, size: Number(event.target.value) }); }}>
            {pageSizes.map(option => <MenuItem key={option} value={option}>{option}</MenuItem>)}
          </Select>
        </FormControl>
        <Typography variant="body2" role="status">{text.page(page, totalPages)}</Typography>
        <Stack component="form" direction="row" alignItems="center" spacing={1} noValidate
          onSubmit={(event) => {
            event.preventDefault(); setAttempted(true);
            if (!valid || disabled || requested === page) return;
            onChange({ page: requested, size });
          }}>
          <TextField id={id} size="small" value={jump} disabled={disabled || totalPages === 0}
            onChange={(event) => { setJump(event.target.value); setAttempted(false); }}
            error={invalid} helperText={invalid ? text.invalid(totalPages) : undefined}
            slotProps={{ htmlInput: { inputMode: 'numeric', 'aria-label': text.jump, placeholder: text.jump } }} sx={{ width: 160 }} />
          <Button type="submit" variant="outlined" disabled={disabled || totalPages === 0}>{text.go}</Button>
        </Stack>
        <Tooltip title={text.previous}><span><IconButton aria-label={text.previous} disabled={disabled || page <= 1}
          onClick={() => onChange({ page: page - 1, size })}>
          <Box component="svg" aria-hidden="true" viewBox="0 0 24 24" sx={{ width: 22, height: 22, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
            <path d="m14.5 5-7 7 7 7" />
          </Box>
        </IconButton></span></Tooltip>
        <Tooltip title={text.next}><span><IconButton aria-label={text.next} disabled={disabled || page >= totalPages}
          onClick={() => onChange({ page: page + 1, size })}>
          <Box component="svg" aria-hidden="true" viewBox="0 0 24 24" sx={{ width: 22, height: 22, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
            <path d="m9.5 5 7 7-7 7" />
          </Box>
        </IconButton></span></Tooltip>
      </Stack>
    </Box>
  );
}
