import type { MouseEventHandler } from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';

export type TableActionIconName = 'view' | 'edit' | 'remove' | 'select' | 'selected' | 'failure' | 'settle';

export function TableActionIcon({ name }: { name: TableActionIconName }) {
  const props = {
    component: 'svg' as const,
    'aria-hidden': true,
    viewBox: '0 0 24 24',
    sx: { width: 20, height: 20, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8,
      strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const },
  };

  switch (name) {
    case 'view':
      return <Box {...props}><path d="M2.8 12s3.2-6 9.2-6 9.2 6 9.2 6-3.2 6-9.2 6-9.2-6-9.2-6Z" /><circle cx="12" cy="12" r="2.5" /></Box>;
    case 'edit':
      return <Box {...props}><path d="m4 16.5-.8 4.3 4.3-.8L19.8 7.7a2.1 2.1 0 0 0-3-3L4 16.5Z" /><path d="m15.5 6 3 3" /></Box>;
    case 'remove':
      return <Box {...props}><path d="M4.5 7h15M9 7V4.5h6V7m3.5 0-.8 13h-12L5 7m4 3v6m6-6v6" /></Box>;
    case 'select':
      return <Box {...props}><circle cx="12" cy="12" r="8.5" /><path d="M12 8v8m-4-4h8" /></Box>;
    case 'selected':
      return <Box {...props}><circle cx="12" cy="12" r="8.5" /><path d="m8 12 2.5 2.5L16.5 9" /></Box>;
    case 'failure':
      return <Box {...props}><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5m0 3h.01" /></Box>;
    case 'settle':
      return <Box {...props}><path d="M4 7h12a3 3 0 0 1 0 6H8" /><path d="m11 10-3 3 3 3" /><path d="M4 5v14" /></Box>;
  }
}

export function TableActionButton({ label, icon, onClick, disabled = false, pressed }: {
  label: string;
  icon: TableActionIconName;
  onClick: MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  pressed?: boolean;
}) {
  return <Tooltip title={label}>
    <Box component="span" sx={{ display: 'inline-flex' }}>
      <IconButton aria-label={label} aria-pressed={pressed} disabled={disabled} onClick={onClick}
        sx={{ width: 36, height: 36, flexShrink: 0, color: 'primary.main' }}>
        <TableActionIcon name={icon} />
      </IconButton>
    </Box>
  </Tooltip>;
}
