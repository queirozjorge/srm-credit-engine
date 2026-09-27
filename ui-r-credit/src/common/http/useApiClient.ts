import { useMemo } from 'react';
import { useSession } from '../../auth/services/sessionContext';
import { useAppFeedback } from '../components/feedbackContext';
import { demoMode } from '../../app/config';
import { createApiClient } from './client';
export function useApiClient() {
  const { session } = useSession();
  const { showWarning } = useAppFeedback();
  return useMemo(() => createApiClient({ token: session.token, prepare: session.prepare, sessionSignal: session.signal, onUnauthorized: session.expire,
    headers: (): Record<string, string> => demoMode ? { 'X-Demo-Subject': session.getSnapshot().identity?.subject ?? '' } : {},
    onError: error => showWarning({ message: error.message, details: error.details?.map(issue => issue.message), dedupeKey: `${error.status}:${error.code}` }),
  }), [session, showWarning]);
}
