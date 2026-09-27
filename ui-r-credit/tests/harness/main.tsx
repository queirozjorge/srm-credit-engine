import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from '../../src/app/App';
import { AppProviders } from '../../src/app/AppProviders';
import { RuntimeBootstrap } from './RuntimeBootstrap';

createRoot(document.getElementById('root')!).render(
  <StrictMode><AppProviders><RuntimeBootstrap><BrowserRouter><App /></BrowserRouter></RuntimeBootstrap></AppProviders></StrictMode>,
);
