import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { Serwist } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

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

serwist.addEventListeners();
