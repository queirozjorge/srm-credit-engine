import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { locale, translations } from './src/i18n/pt-BR';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'localized-document-title',
      transformIndexHtml: () => [
        { tag: 'title', children: translations[locale].app.name, injectTo: 'head' },
      ],
    },
  ],
  server: { host: '127.0.0.1', port: 5174, strictPort: true },
  preview: { host: '127.0.0.1', port: 4174, strictPort: true },
});
