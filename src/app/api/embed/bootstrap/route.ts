import { NextResponse } from 'next/server';

import { getCompanionProfile } from '@/lib/astra/db/profile';
import { requireAstraIdentity, respondAstraIdentityError } from '@/lib/astra/guard';
import { ensureAstraWorkspace } from '@/lib/astra/workspace';
import { embedCorsHeaders, withEmbedCors } from '@/lib/embed/cors';
import { isSupabaseConfigured } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

export async function OPTIONS(request: Request) {
  const origin = request.headers.get('origin');
  return new NextResponse(null, {
    status: 204,
    headers: embedCorsHeaders(origin),
  });
}

export async function GET(request: Request) {
  const origin = request.headers.get('origin');

  if (!isSupabaseConfigured()) {
    return withEmbedCors(
      NextResponse.json({ error: 'Supabase is not configured' }, { status: 503 }),
      origin,
    );
  }

  try {
    const identity = await requireAstraIdentity(request);
    const workspace = await ensureAstraWorkspace(identity.astraKey, identity.userId);
    const profile = await getCompanionProfile(workspace.id);

    return withEmbedCors(
      NextResponse.json({
        astraKey: identity.astraKey,
        userId: identity.userId,
        companionProfile: profile,
      }),
      origin,
    );
  } catch (error) {
    const identityResponse = respondAstraIdentityError(error);
    if (identityResponse) {
      return withEmbedCors(identityResponse, origin);
    }
    return withEmbedCors(
      NextResponse.json({ error: 'Could not bootstrap embed session.' }, { status: 500 }),
      origin,
    );
  }
}
