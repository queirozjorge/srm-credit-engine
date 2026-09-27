import { useRef, useState } from 'react';
import { Button } from '@mui/material';
import { useAppFeedback } from '../../common/components/feedbackContext';
import { useSession } from '../services/sessionContext';
import { locale, translations } from '../../i18n/pt-BR';
export function SignOutButton() {
  const { session } = useSession(); const { beginLoading, showWarning } = useAppFeedback();
  const sending = useRef(false); const [pending, setPending] = useState(false); const text = translations[locale].auth;
  return <Button disabled={pending} onClick={() => {
    if (sending.current) return; sending.current = true; setPending(true); const end = beginLoading();
    void session.logout().catch(() => showWarning({ message: text.logoutFailed })).finally(() => { sending.current = false; setPending(false); end(); });
  }}>{text.signOut}</Button>;
}
