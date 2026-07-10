import { NextResponse } from 'next/server';

import { requireAstraIdentity, respondAstraIdentityError } from '@/lib/astra/guard';
import { isCapabilityPushConfigured } from '@/lib/capabilities/push';
import { createUntypedAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    await requireAstraIdentity(request, { ensureWorkspace: false });
    return NextResponse.json({
      enabled: isCapabilityPushConfigured(),
      publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || null,
    });
  } catch (error) {
    return respondAstraIdentityError(error) ??
      NextResponse.json({ enabled: false, publicKey: null });
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requireAstraIdentity(request, { ensureWorkspace: false });
    const subscription = (await request.json()) as Record<string, unknown>;
    const endpoint = typeof subscription.endpoint === 'string' ? subscription.endpoint.trim() : '';
    if (!endpoint || !subscription.keys || typeof subscription.keys !== 'object') {
      return NextResponse.json({ ok: false, code: 'invalid_subscription' }, { status: 400 });
    }
    const { error } = await createUntypedAdminClient()
      .from('astra_push_subscriptions')
      .upsert(
        {
          user_id: identity.userId,
          endpoint,
          subscription,
          user_agent: request.headers.get('user-agent'),
        },
        { onConflict: 'user_id,endpoint' },
      );
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const identityError = respondAstraIdentityError(error);
    if (identityError) return identityError;
    return NextResponse.json({ ok: false, code: 'subscription_failed' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const identity = await requireAstraIdentity(request, { ensureWorkspace: false });
    const endpoint = new URL(request.url).searchParams.get('endpoint')?.trim();
    if (!endpoint) return NextResponse.json({ ok: false, code: 'endpoint_required' }, { status: 400 });
    const { error } = await createUntypedAdminClient()
      .from('astra_push_subscriptions')
      .delete()
      .eq('user_id', identity.userId)
      .eq('endpoint', endpoint);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const identityError = respondAstraIdentityError(error);
    if (identityError) return identityError;
    return NextResponse.json({ ok: false, code: 'subscription_failed' }, { status: 500 });
  }
}
