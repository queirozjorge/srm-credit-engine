function isLegacyWorker(worker: ServiceWorker | null) {
  return worker !== null && new URL(worker.scriptURL).origin === location.origin
    && new URL(worker.scriptURL).pathname === '/mockServiceWorker.js';
}

/** Remove only the former demonstration worker; preserve unrelated registrations. */
export async function retireLegacyWorker() {
  if (!('serviceWorker' in navigator)) return;
  const controller = navigator.serviceWorker.controller;
  if (controller && isLegacyWorker(controller)) controller.postMessage('CLIENT_CLOSED');
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.filter(registration => {
    const workers = [registration.active, registration.waiting, registration.installing];
    return workers.some(worker => worker && isLegacyWorker(worker));
  }).map(registration => registration.unregister()));
}
