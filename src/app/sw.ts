import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { Serwist } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

interface CapabilityPushPayload {
  capabilityId?: string;
  revision?: number;
  title?: string;
  body?: string;
  url?: string;
}

function isModelPrecacheEntry(entry: PrecacheEntry | string): boolean {
  const url = typeof entry === 'string' ? entry : entry.url;
  return url.startsWith('/models/perception/');
}

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST?.filter((entry) => !isModelPrecacheEntry(entry)),
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

self.addEventListener('push', (event) => {
  let payload: CapabilityPushPayload = {};
  try {
    payload = event.data?.json() as CapabilityPushPayload;
  } catch {
    payload = { body: event.data?.text() };
  }
  const capabilityId = payload.capabilityId ?? 'unknown';
  const revision = payload.revision ?? 0;
  event.waitUntil(
    self.registration.showNotification(payload.title || 'Chrysty reminder', {
      body: payload.body || 'A scheduled item is due.',
      tag: `capability:${capabilityId}:${revision}`,
      data: { url: payload.url || '/', capabilityId, revision },
      icon: '/icons/icon.svg',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = typeof event.notification.data?.url === 'string' ? event.notification.data.url : '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      const existing = clients.find((client) => 'focus' in client);
      if (existing && 'navigate' in existing) {
        await existing.navigate(target);
        return existing.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});

serwist.addEventListeners();
