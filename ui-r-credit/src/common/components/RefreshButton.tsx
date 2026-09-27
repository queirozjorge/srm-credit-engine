import { Box, IconButton, Tooltip } from '@mui/material';

export interface RefreshButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export function RefreshButton({ label, onClick, disabled = false }: RefreshButtonProps) {
  return (
    <Tooltip title={label}>
      <Box component="span" sx={{ display: 'inline-flex' }}>
        <IconButton aria-label={label} disabled={disabled} onClick={onClick}
          sx={{ width: 44, height: 44, flexShrink: 0, color: 'primary.main' }}>
          <Box component="svg" aria-hidden="true" viewBox="0 0 24 24"
            sx={{ width: 24, height: 24, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
            <path d="M20 7v5h-5M4.7 9a7.5 7.5 0 0 1 12.8-2L20 12M4 17v-5h5m10.3 3a7.5 7.5 0 0 1-12.8 2L4 12" />
          </Box>
        </IconButton>
      </Box>
    </Tooltip>
  );
}
