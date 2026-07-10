import webpush, { type PushSubscription } from 'web-push';

import { createUntypedAdminClient } from '@/lib/supabase/admin';

import { claimCapabilityDelivery } from './db';
import type { ScheduledCapability } from './types';

function getVapidConfig(): {
  subject: string;
  publicKey: string;
  privateKey: string;
} | null {
  const subject = process.env.VAPID_SUBJECT?.trim();
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  return subject && publicKey && privateKey ? { subject, publicKey, privateKey } : null;
}

export function isCapabilityPushConfigured(): boolean {
  return getVapidConfig() !== null;
}

export async function deliverCapabilityPush(
  capability: ScheduledCapability,
): Promise<number> {
  const config = getVapidConfig();
  if (!config) return 0;

  const client = createUntypedAdminClient();
  const { data, error } = await client
    .from('astra_push_subscriptions')
    .select('id, subscription')
    .eq('user_id', capability.userId);
  if (error) throw new Error(error.message);
  if (!data?.length) return 0;

  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  const payload = JSON.stringify({
    capabilityId: capability.id,
    revision: capability.revision,
    title: capability.title,
    body: `${capability.kind === 'timer' ? 'Timer' : capability.kind === 'checkpoint' ? 'Checkpoint' : 'Reminder'} due now`,
    url: '/',
  });

  let delivered = 0;
  for (const row of data as Array<{ id: string; subscription: PushSubscription }>) {
    try {
      await webpush.sendNotification(row.subscription, payload, {
        TTL: 60 * 60,
        urgency: 'high',
      });
      delivered += 1;
    } catch (error) {
      const statusCode =
        typeof error === 'object' && error && 'statusCode' in error
          ? Number(error.statusCode)
          : 0;
      if (statusCode === 404 || statusCode === 410) {
        await client.from('astra_push_subscriptions').delete().eq('id', row.id);
      }
    }
  }

  if (delivered > 0) {
    await claimCapabilityDelivery(capability, 'push');
  }
  return delivered;
}
