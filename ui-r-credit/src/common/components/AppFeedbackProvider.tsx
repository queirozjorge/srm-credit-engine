import { useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { Box } from '@mui/material';
import { AppLoader } from './AppLoader';
import { FeedbackContext } from './feedbackContext';
import { WarningDialog, type WarningNotice } from './WarningDialog';

export function AppFeedbackProvider({ children }: PropsWithChildren) {
  const nextId = useRef(0);
  const count = useRef(0);
  const origin = useRef<HTMLElement | null>(null);
  const lastControl = useRef<HTMLElement | null>(null);
  useEffect(() => {
    function remember(event: FocusEvent) {
      const target = event.target;
      // Opções são transitórias; o foco deve voltar ao controle que abriu a lista.
      if (count.current === 0 && target instanceof HTMLElement && target !== document.body && target !== document.documentElement &&
          !target.closest('[role="listbox"], [role="menu"]')) lastControl.current = target;
    }
    document.addEventListener('focusin', remember);
    return () => document.removeEventListener('focusin', remember);
  }, []);
  const [loaderMounted, setLoaderMounted] = useState(false);
  const [activeNotice, setActiveNotice] = useState<WarningNotice | null>(null);
  const [pending, setPending] = useState<Set<number>>(() => new Set());
  const [notices, setNotices] = useState<WarningNotice[]>([]);
  const [closing, setClosing] = useState(false);

  const beginLoading = useCallback(() => {
    const id = nextId.current++;
    if (count.current++ === 0 && !origin.current) {
      const focused = document.activeElement;
      origin.current = focused instanceof HTMLElement && focused !== document.body && !focused.closest('[role="listbox"], [role="menu"]')
        ? focused : lastControl.current;
    }
    setPending((current) => new Set(current).add(id));
    let released = false;
    return () => {
      if (released) return;
      released = true;
      count.current--;
      setPending((current) => { const next = new Set(current); next.delete(id); return next; });
    };
  }, []);

  const showWarning = useCallback((notice: WarningNotice) => {
    const key = notice.dedupeKey ?? JSON.stringify([notice.title, notice.message, notice.details]);
    setNotices((current) => current.some((item) => item.dedupeKey === key)
      ? current : [...current, { ...notice, dedupeKey: key }]);
  }, []);

  const value = useMemo(() => ({ beginLoading, showWarning }), [beginLoading, showWarning]);
  const notice = notices[0];
  const loading = pending.size > 0;
  if (loading && !loaderMounted) setLoaderMounted(true);
  if (!activeNotice && notice && !loading && !loaderMounted) setActiveNotice(notice);
  function finishLoading() {
    if (count.current > 0) return;
    const target = origin.current;
    if (target?.isConnected && target.getClientRects().length && !target.matches(':disabled') && !target.closest('[inert]')) {
      target.focus({ preventScroll: true });
    } else {
      const dialogs = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')];
      const heading = dialogs.at(-1)?.querySelector<HTMLElement>('[tabindex="-1"]') ?? document.querySelector<HTMLElement>('main h1');
      heading?.focus({ preventScroll: true });
    }
    origin.current = null;
    setLoaderMounted(false);
  }
  return (
    <FeedbackContext.Provider value={value}>
      <Box inert={loading} aria-busy={loading}>{children}</Box>
      {activeNotice && <WarningDialog open={!closing} notice={activeNotice} onClose={() => setClosing(true)}
        onExited={() => { setNotices((current) => current.slice(1)); setActiveNotice(null); setClosing(false); }} />}
      <AppLoader open={loading} disableRestoreFocus onExited={finishLoading} />
    </FeedbackContext.Provider>
  );
}
