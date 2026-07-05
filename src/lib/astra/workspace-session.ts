'use client';

import { ASTRA_KEY_CHANGED_EVENT } from '@/lib/astra/constants';
import { getStoredAstraKey, resolveActiveAstraKey } from '@/lib/astra/identity';
import { migrateLocalDataIfNeeded } from '@/lib/astra/migrate-local';
import { syncCanonicalAstraKeyFromServer } from '@/lib/astra/workspace-remote';
import { isRemotePersistenceEnabled } from '@/lib/astra/api-client';

let sessionReady: Promise<string> | null = null;

export function ensureAstraWorkspaceKeyReady(): Promise<string> {
  if (typeof window === 'undefined') {
    return Promise.resolve('');
  }

  if (!sessionReady) {
    sessionReady = (async () => {
      const previous = getStoredAstraKey();
      resolveActiveAstraKey();

      if (isRemotePersistenceEnabled()) {
        await migrateLocalDataIfNeeded();
        await syncCanonicalAstraKeyFromServer();
      }

      const next = resolveActiveAstraKey();
      if (previous !== next) {
        window.dispatchEvent(new Event(ASTRA_KEY_CHANGED_EVENT));
      }
      return next;
    })();
  }

  return sessionReady;
}

export function resetAstraWorkspaceSessionForTests(): void {
  sessionReady = null;
}
