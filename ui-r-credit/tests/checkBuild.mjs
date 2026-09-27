import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
const files = await readdir(new URL('../dist/', import.meta.url), { recursive: true });
assert(!files.some(file => /mockServiceWorker|fixtures|harness|tests\//i.test(file)), 'O build contém infraestrutura de teste.');
for (const file of files.filter(file => file.endsWith('.js'))) {
  const contents = await readFile(new URL(`../dist/${file}`, import.meta.url), 'utf8');
  assert(!/setupWorker|X-Demo-Subject|operador-demo|gestor-demo|SRM-DEMONSTRACAO|VITE_API_MODE/.test(contents), `Runtime demonstrativo encontrado: ${file}`);
}
console.log('Build validado: sem MSW, fixtures ou autenticação demonstrativa.');
