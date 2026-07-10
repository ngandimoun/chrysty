import { NextResponse } from 'next/server';

import { requireAstraIdentity, respondAstraIdentityError } from '@/lib/astra/guard';
import { ensureAstraWorkspace } from '@/lib/astra/workspace';
import { validateManageCapability } from '@/lib/capabilities/contract';
import { manageCapability } from '@/lib/capabilities/db';
import { isSupabaseConfigured } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

async function ownerFor(request: Request) {
  const identity = await requireAstraIdentity(request);
  const workspace = await ensureAstraWorkspace(identity.astraKey, identity.userId);
  return { ...identity, workspaceId: workspace.id };
}

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, code: 'unavailable', message: 'Scheduling is not configured.' }, { status: 503 });
  }
  try {
    const owner = await ownerFor(request);
    const result = await manageCapability(owner, { action: 'list' });
    return NextResponse.json(result);
  } catch (error) {
    const identityError = respondAstraIdentityError(error);
    if (identityError) return identityError;
    return NextResponse.json(
      { ok: false, code: 'server_error', message: 'Could not list scheduled capabilities.', retryable: true },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, code: 'unavailable', message: 'Scheduling is not configured.' }, { status: 503 });
  }
  try {
    const parsed = validateManageCapability((await request.json()) as Record<string, unknown>);
    if (!parsed.ok) return NextResponse.json(parsed.error, { status: 400 });
    const result = await manageCapability(await ownerFor(request), parsed.value);
    return NextResponse.json(result, { status: result.ok ? 200 : result.code === 'revision_conflict' ? 409 : 400 });
  } catch (error) {
    const identityError = respondAstraIdentityError(error);
    if (identityError) return identityError;
    return NextResponse.json(
      { ok: false, code: 'server_error', message: 'Could not update scheduled capabilities.', retryable: true },
      { status: 500 },
    );
  }
}
