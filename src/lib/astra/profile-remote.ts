'use client';

import { astraFetch } from '@/lib/astra/api-client';
import {
  hasCompanionProfile,
  loadCompanionProfile,
  normalizeCompanionProfile,
  type CompanionProfile,
} from '@/lib/client/companion-profile';

const LOCAL_STORAGE_KEY = 'chrysty-companion-profile';

export async function fetchRemoteCompanionProfile(): Promise<CompanionProfile> {
  const response = await astraFetch('/api/astra/profile');
  if (!response.ok) {
    throw new Error('Could not load profile');
  }
  const body = (await response.json()) as { profile?: CompanionProfile };
  return normalizeCompanionProfile(body.profile ?? {});
}

export async function saveRemoteCompanionProfile(profile: CompanionProfile): Promise<CompanionProfile> {
  const normalized = normalizeCompanionProfile(profile);
  const response = await astraFetch('/api/astra/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile: normalized }),
  });

  if (!response.ok) {
    throw new Error('Could not save profile');
  }

  const body = (await response.json()) as { profile?: CompanionProfile };
  return normalizeCompanionProfile(body.profile ?? normalized);
}

export function loadLocalCompanionProfileOnly(): CompanionProfile {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return {};
    return normalizeCompanionProfile(JSON.parse(raw) as CompanionProfile);
  } catch {
    return {};
  }
}

export function clearLocalCompanionProfile(): void {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(LOCAL_STORAGE_KEY);
  }
}

export function hasLocalCompanionProfile(): boolean {
  return hasCompanionProfile(loadLocalCompanionProfileOnly());
}

export async function loadCompanionProfileForApp(): Promise<CompanionProfile> {
  try {
    return await fetchRemoteCompanionProfile();
  } catch {
    return loadCompanionProfile();
  }
}
