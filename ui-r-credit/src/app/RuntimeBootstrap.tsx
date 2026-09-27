import { useEffect, useState, type PropsWithChildren } from 'react';
import { Box, Button } from '@mui/material';
import { AppLoader } from '../common/components/AppLoader';
import { useAppFeedback } from '../common/components/feedbackContext';
import { locale, translations } from '../i18n/pt-BR';
import { demoMode } from './config';
let initialization: Promise<void> | undefined;
function initialize() {
  if (!initialization) {
    initialization = import('./mocks/browser').then(module => module.startDemo()).catch(error => {
      initialization = undefined;
      throw error;
    });
  }
  return initialization;
}
export function RuntimeBootstrap({ children }: PropsWithChildren) {
  const [status, setStatus] = useState(demoMode ? 'loading' : 'ready');
  const [attempt, setAttempt] = useState(0);
  const { showWarning } = useAppFeedback();
  useEffect(() => {
    if (!demoMode) return;
    let active = true;
    void initialize().then(() => { if (active) setStatus('ready'); }).catch(() => {
      if (!active) return;
      setStatus('failed');
      showWarning({ message: translations[locale].demo.startupError });
    });
    return () => { active = false; };
  }, [attempt, showWarning]);
  if (status === 'ready') return children;
  return <>
    <AppLoader open={status === 'loading'} />
    {status === 'failed' && <Box component="main" sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }}>
      <Button variant="contained" onClick={() => { setStatus('loading'); setAttempt(value => value + 1); }}>{translations[locale].demo.retry}</Button>
    </Box>}
  </>;
}
