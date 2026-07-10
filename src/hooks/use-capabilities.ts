'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { astraFetch, isRemotePersistenceEnabled } from '@/lib/astra/api-client';
import type { ManageCapabilityInput, ScheduledCapability } from '@/lib/capabilities/types';
import {
  capabilityDeliveryKey,
  shouldDeliverCapability,
} from '@/lib/capabilities/lifecycle';

const POLL_MS = 30_000;
const DELIVERED_STORAGE_KEY = 'chrysty:capability-deliveries:v1';

function deliveredKeys(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    return new Set(JSON.parse(localStorage.getItem(DELIVERED_STORAGE_KEY) || '[]') as string[]);
  } catch {
    return new Set();
  }
}

function markDelivered(key: string): void {
  const keys = deliveredKeys();
  keys.add(key);
  localStorage.setItem(DELIVERED_STORAGE_KEY, JSON.stringify([...keys].slice(-500)));
}

function publicKeyBytes(value: string): ArrayBuffer {
  const padded = `${value}${'='.repeat((4 - (value.length % 4)) % 4)}`.replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export function useCapabilities(options?: {
  onDue?: (capability: ScheduledCapability) => void;
}) {
  const enabled = isRemotePersistenceEnabled();
  const [capabilities, setCapabilities] = useState<ScheduledCapability[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [pushEnabled, setPushEnabled] = useState(false);
  const onDueRef = useRef(options?.onDue);
  useEffect(() => {
    onDueRef.current = options?.onDue;
  });

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const response = await astraFetch('/api/astra/capabilities');
    const body = (await response.json()) as { ok?: boolean; capabilities?: ScheduledCapability[] };
    if (response.ok && body.ok) setCapabilities(body.capabilities ?? []);
  }, [enabled]);

  const act = useCallback(
    async (input: ManageCapabilityInput) => {
      const response = await astraFetch('/api/astra/capabilities', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      const body = await response.json();
      await refresh();
      return body;
    },
    [refresh],
  );

  useEffect(() => {
    if (!enabled) return;
    const initial = window.setTimeout(() => void refresh(), 0);
    const poll = window.setInterval(() => void refresh(), POLL_MS);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(poll);
      window.clearInterval(clock);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, refresh]);

  const displayCapabilities = useMemo(
    () =>
      capabilities.map((capability) =>
        ['scheduled', 'snoozed'].includes(capability.status) &&
        Date.parse(capability.fireAt) <= now
          ? { ...capability, status: 'due' as const }
          : capability,
      ),
    [capabilities, now],
  );

  useEffect(() => {
    for (const capability of displayCapabilities) {
      if (capability.status !== 'due') continue;
      const key = capabilityDeliveryKey(capability.id, capability.revision);
      if (!shouldDeliverCapability(deliveredKeys(), capability.id, capability.revision)) continue;
      markDelivered(key);
      onDueRef.current?.(capability);
    }
  }, [displayCapabilities]);

  const requestPush = useCallback(async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      return { ok: false, code: 'unsupported' };
    }
    const configResponse = await astraFetch('/api/astra/push-subscription');
    const config = (await configResponse.json()) as { enabled?: boolean; publicKey?: string | null };
    if (!config.enabled || !config.publicKey) return { ok: false, code: 'not_configured' };
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return { ok: false, code: 'permission_denied' };
    const registration = await navigator.serviceWorker.ready;
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: publicKeyBytes(config.publicKey),
      }));
    const response = await astraFetch('/api/astra/push-subscription', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(subscription.toJSON()),
    });
    setPushEnabled(response.ok);
    return { ok: response.ok, code: response.ok ? undefined : 'subscription_failed' };
  }, []);

  return {
    capabilities: displayCapabilities,
    now,
    active: displayCapabilities.filter((item) =>
      ['scheduled', 'snoozed', 'due'].includes(item.status),
    ),
    refresh,
    act,
    pushEnabled,
    requestPush,
  };
}
