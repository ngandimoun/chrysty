import { NextResponse } from 'next/server';

import { getCompanionProfile, upsertCompanionProfile } from '@/lib/astra/db/profile';
import { requireAstraIdentity, respondAstraIdentityError } from '@/lib/astra/guard';
import { ensureAstraWorkspace } from '@/lib/astra/workspace';
import type { CompanionProfile } from '@/lib/client/companion-profile';
import { isSupabaseConfigured } from '@/lib/supabase/admin';

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ profile: {} satisfies CompanionProfile });
  }

  try {
    const identity = await requireAstraIdentity(request);
    const workspace = await ensureAstraWorkspace(identity.astraKey, identity.userId);
    const profile = await getCompanionProfile(workspace.id);
    return NextResponse.json({
      profile,
      astraKey: identity.astraKey,
      userId: identity.userId ?? null,
    });
  } catch (error) {
    const response = respondAstraIdentityError(error);
    if (response) return response;
    const message = error instanceof Error ? error.message : 'Could not load profile';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase is not configured' }, { status: 503 });
  }

  try {
    const identity = await requireAstraIdentity(request);
    const workspace = await ensureAstraWorkspace(identity.astraKey, identity.userId);
    const body = (await request.json()) as { profile?: CompanionProfile };
    const profile = await upsertCompanionProfile(
      workspace.id,
      identity.astraKey,
      body.profile ?? {},
      identity.userId,
    );
    return NextResponse.json({ profile });
  } catch (error) {
    const response = respondAstraIdentityError(error);
    if (response) return response;
    const message = error instanceof Error ? error.message : 'Could not save profile';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
