'use client';

import { isRemotePersistenceEnabled, astraFetch } from '@/lib/astra/api-client';
import { ASTRA_PERSONAL_KEY_STORAGE } from '@/lib/astra/constants';
import {
  getStoredAstraKey,
  rememberPersonalAstraKey,
  resolveActiveAstraKey,
  setStoredAstraKey,
} from '@/lib/astra/identity';

export async function syncCanonicalAstraKeyFromServer(): Promise<string> {
  resolveActiveAstraKey();

  if (!isRemotePersistenceEnabled()) {
    return resolveActiveAstraKey();
  }

  const response = await astraFetch('/api/astra/profile');
  if (!response.ok) {
    return resolveActiveAstraKey();
  }

  const body = (await response.json()) as {
    astraKey?: string;
    userId?: string | null;
  };

  const serverKey = body.astraKey?.trim();
  if (serverKey?.startsWith('ak_')) {
    setStoredAstraKey(serverKey);
    rememberPersonalAstraKey(serverKey);
    return serverKey;
  }

  return resolveActiveAstraKey();
}

export function hasPersonalWorkspaceBackup(): boolean {
  if (typeof window === 'undefined') return false;
  const envKey = process.env.NEXT_PUBLIC_ASTRA_PERSONAL_KEY?.trim();
  if (envKey?.startsWith('ak_')) return true;
  const backup = window.localStorage.getItem(ASTRA_PERSONAL_KEY_STORAGE);
  return Boolean(backup?.startsWith('ak_'));
}

export function isLikelyWrongWorkspaceKey(): boolean {
  const active = getStoredAstraKey();
  const envKey = process.env.NEXT_PUBLIC_ASTRA_PERSONAL_KEY?.trim();
  if (envKey && active && active !== envKey) return true;
  return false;
}
