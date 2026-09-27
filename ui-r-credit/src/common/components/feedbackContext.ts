import { createContext, useContext } from 'react';
import type { WarningNotice } from './WarningDialog';

export interface AppFeedback {
  beginLoading: () => () => void;
  showWarning: (notice: WarningNotice) => void;
}
export const FeedbackContext = createContext<AppFeedback | null>(null);

export function useAppFeedback() {
  const value = useContext(FeedbackContext);
  if (!value) throw new Error('Provedor de feedback indisponível.');
  return value;
}
