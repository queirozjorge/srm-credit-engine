import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig } from 'vite';
import base from './vite.config';

// This entry is exclusive to browser tests. The distributed application never loads it.
export default mergeConfig(base, defineConfig({
  publicDir: 'tests/public',
  cacheDir: 'node_modules/.vite-isolated',
  optimizeDeps: { include: ['msw/browser'] },
  server: { hmr: false },
  plugins: [{
    name: 'isolated-browser-harness',
    enforce: 'pre',
    resolveId(source) {
      if (source.endsWith('/auth/pages/SignInPage')) return fileURLToPath(new URL('./tests/harness/SignInPage.tsx', import.meta.url));
    },
    transformIndexHtml: html => html.replace('/src/main.tsx', '/tests/harness/main.tsx'),
  }],
}));
