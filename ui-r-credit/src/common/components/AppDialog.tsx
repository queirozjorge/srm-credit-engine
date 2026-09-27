import { useId, useRef, useState, type ReactNode } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, useMediaQuery } from '@mui/material';
import type { DialogProps } from '@mui/material/Dialog';
import { locale, translations } from '../../i18n/pt-BR';

export interface AppDialogProps {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  onExited?: () => void;
  actions?: ReactNode;
  closeLabel?: string;
  closeOnBackdrop?: boolean;
  closeDisabled?: boolean;
  closeVariant?: 'text' | 'outlined' | 'contained';
  describedBy?: string;
  maxWidth?: DialogProps['maxWidth'];
}

// Mesmo ciclo do protótipo: fechar uma vez, terminar a saída, restaurar foco.
export function AppDialog({ open, title, children, onClose, onExited, actions,
  closeLabel = translations[locale].common.close, closeOnBackdrop = false, closeDisabled = false, closeVariant = 'contained', describedBy, maxWidth = 'sm' }: AppDialogProps) {
  const titleId = useId();
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [previousOpen, setPreviousOpen] = useState(open);
  const [phase, setPhase] = useState<'open' | 'closing' | 'closed'>(open ? 'open' : 'closed');
  const closeRequested = useRef(false);
  const origin = useRef<HTMLElement | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  if (open !== previousOpen) {
    setPreviousOpen(open);
    if (!open && phase === 'open') setPhase('closing');
    if (open && phase === 'closed') setPhase('open');
  }

  function enter() {
    const active = document.activeElement;
    if (!heading.current?.closest('[role="dialog"]')?.contains(active)) {
      origin.current = active instanceof HTMLElement ? active : null;
    }
    heading.current?.focus({ preventScroll: true });
  }

  function requestClose() {
    if (phase !== 'open' || closeRequested.current || closeDisabled) return;
    closeRequested.current = true;
    setPhase('closing');
    onClose();
  }

  function finishClose() {
    setPhase('closed');
    closeRequested.current = false;
    const target = origin.current;
    if (target?.isConnected && !target.closest('[inert]') && !target.matches(':disabled')) {
      target.focus({ preventScroll: true });
    } else {
      document.querySelector<HTMLElement>('main')?.focus({ preventScroll: true });
    }
    onExited?.();
  }

  const shouldRender = phase !== 'closed';
  const isClosing = phase === 'closing';
  if (!shouldRender) return null;

  return (
    <Dialog open={!isClosing} fullWidth maxWidth={maxWidth} disableAutoFocus disableRestoreFocus
      aria-labelledby={titleId} aria-describedby={describedBy}
      transitionDuration={reducedMotion ? 0 : 180}
      onClose={(_, reason) => { if (reason !== 'backdropClick' || closeOnBackdrop) requestClose(); }}
      onClick={(event) => event.stopPropagation()}
      onKeyDownCapture={(event) => { if (isClosing) { event.preventDefault(); event.stopPropagation(); } }}
      slotProps={{ transition: { onEnter: enter, onExited: finishClose } }}>
      <DialogTitle ref={heading} id={titleId} tabIndex={-1}>{title}</DialogTitle>
      <DialogContent dividers onClick={(event) => event.stopPropagation()}>{children}</DialogContent>
      <DialogActions sx={{ p: 2, flexWrap: 'wrap', gap: 1 }}>
        {actions}
        <Button onClick={requestClose} disabled={isClosing || closeDisabled} variant={closeVariant}>{closeLabel}</Button>
      </DialogActions>
    </Dialog>
  );
}
