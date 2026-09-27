import { retireLegacyWorker } from './app/retireLegacyWorker';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './app/App';
import { AppProviders } from './app/AppProviders';
import { OidcBootstrap } from './auth/components/OidcBootstrap';
const root = document.getElementById('root');

if (!root) {
  throw new Error('Elemento raiz da aplicação não encontrado.');
}

// Cleanup failure must not prevent access to the real application.
void retireLegacyWorker().catch(error => {
  console.error('[startup]:[error]: LEGACY_WORKER_CLEANUP - Falha ao remover worker legado.', error);
}).finally(() => createRoot(root).render(
  <StrictMode>
    <AppProviders><OidcBootstrap><BrowserRouter><App /></BrowserRouter></OidcBootstrap></AppProviders>
  </StrictMode>,
));
