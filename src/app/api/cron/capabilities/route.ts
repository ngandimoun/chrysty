import { NextResponse } from 'next/server';

import {
  claimCapabilityDelivery,
  transitionDueCapabilities,
} from '@/lib/capabilities/db';
import { isCronAuthorized } from '@/lib/capabilities/cron-auth';
import {
  deliverCapabilityPush,
  isCapabilityPushConfigured,
} from '@/lib/capabilities/push';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const due = await transitionDueCapabilities();
  let inAppDeliveries = 0;
  let pushDeliveries = 0;
  for (const capability of due) {
    if (await claimCapabilityDelivery(capability, 'in_app')) inAppDeliveries += 1;
    pushDeliveries += await deliverCapabilityPush(capability);
  }

  return NextResponse.json({
    ok: true,
    transitioned: due.length,
    in_app_deliveries: inAppDeliveries,
    push_deliveries: pushDeliveries,
    push: isCapabilityPushConfigured() ? 'configured' : 'in_app_fallback',
  });
}
