import { useEffect, useState, type PropsWithChildren } from 'react';
import { AppLoader } from '../../common/components/AppLoader';
import { useAppFeedback } from '../../common/components/feedbackContext';
import { useSession } from '../services/sessionContext';
import type { Session } from '../services/session';
import { locale, translations } from '../../i18n/pt-BR';
const starts = new WeakMap<Session, Promise<void>>();
export function OidcBootstrap({ children }: PropsWithChildren) {
  const { session } = useSession(); const { showWarning } = useAppFeedback();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    let start = starts.get(session);
    if (!start) { start = import('../services/oidc').then(({ createOidc }) => createOidc(session).initialize()); starts.set(session, start); }
    void start.catch(() => { if (active) showWarning({ message: translations[locale].auth.failed }); }).finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, [session, showWarning]);
  return <><AppLoader open={!ready} />{ready && children}</>;
}
