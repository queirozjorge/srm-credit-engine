import { expect, test, vi } from 'vitest';
import { retireLegacyWorker } from './retireLegacyWorker';

test('remove somente o worker legado da própria origem', async () => {
  const deactivate = vi.fn();
  const legacy = vi.fn().mockResolvedValue(true);
  const unrelated = vi.fn().mockResolvedValue(true);
  const external = vi.fn().mockResolvedValue(true);
  vi.stubGlobal('navigator', { serviceWorker: { controller: { scriptURL: `${location.origin}/mockServiceWorker.js`, postMessage: deactivate }, getRegistrations: async () => [
    { active: { scriptURL: `${location.origin}/mockServiceWorker.js` }, unregister: legacy },
    { active: { scriptURL: `${location.origin}/offline.js` }, unregister: unrelated },
    { active: { scriptURL: 'https://external.test/mockServiceWorker.js' }, unregister: external },
  ] } });
  try {
    await retireLegacyWorker();
    expect(deactivate).toHaveBeenCalledWith('CLIENT_CLOSED');
    expect(legacy).toHaveBeenCalledOnce();
    expect(unrelated).not.toHaveBeenCalled(); expect(external).not.toHaveBeenCalled();
  } finally { vi.unstubAllGlobals(); }
});
