import { useEffect, useState, type PropsWithChildren } from 'react';
import { Box, Button } from '@mui/material';
import { AppLoader } from '../../src/common/components/AppLoader';
import { useAppFeedback } from '../../src/common/components/feedbackContext';
import { locale, translations } from '../pt-BR';
let initialization: Promise<void> | undefined;
function initialize() {
  if (!initialization) {
    initialization = import('../app/mocks/browser').then(module => module.startDemo()).catch(error => {
      initialization = undefined;
      throw error;
    });
  }
  return initialization;
}
export function RuntimeBootstrap({ children }: PropsWithChildren) {
  const [status, setStatus] = useState('loading');
  const [attempt, setAttempt] = useState(0);
  const { showWarning } = useAppFeedback();
  useEffect(() => {
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
