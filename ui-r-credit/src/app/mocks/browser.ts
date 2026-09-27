import { setupWorker } from 'msw/browser';
import { createDemoHandlers } from './handlers';
export async function startDemo() {
  const worker = setupWorker(...createDemoHandlers());
  await worker.start({ quiet: true, onUnhandledRequest(request, print) {
    if (new URL(request.url).pathname.startsWith('/api/')) print.error();
  } });
}
