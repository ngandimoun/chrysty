import { NextResponse } from 'next/server';

import { validateManageCapability } from '@/lib/capabilities/contract';
import { manageCapability } from '@/lib/capabilities/db';
import { requireLiveServiceAuth } from '@/lib/live/auth';
import { getLiveSession } from '@/lib/live/db';
import { resolveLiveAstraIdentity } from '@/lib/live/identity';
import { createUntypedAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const authError = requireLiveServiceAuth(request);
  if (authError) return authError;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const astraKey = typeof body.astra_key === 'string' ? body.astra_key.trim() : '';
    const sessionId = typeof body.session_id === 'string' ? body.session_id.trim() : '';
    const identity = await resolveLiveAstraIdentity(request, astraKey);
    if (identity instanceof NextResponse) return identity;
    const session = sessionId ? await getLiveSession(sessionId) : null;
    if (
      !session ||
      session.astra_key !== identity.astraKey ||
      session.workspace_id !== identity.workspaceId
    ) {
      return NextResponse.json(
        { ok: false, code: 'invalid_session', message: 'The authenticated Live session is unavailable.' },
        { status: 401 },
      );
    }
    const { data: workspace, error: workspaceError } = await createUntypedAdminClient()
      .from('astra_workspaces')
      .select('user_id')
      .eq('id', identity.workspaceId)
      .eq('astra_key', identity.astraKey)
      .maybeSingle();
    if (workspaceError) throw new Error(workspaceError.message);
    const userId = typeof workspace?.user_id === 'string' ? workspace.user_id : '';
    if (!userId) {
      return NextResponse.json(
        { ok: false, code: 'authentication_required', message: 'Sign in to manage scheduled capabilities.' },
        { status: 401 },
      );
    }
    const parsed = validateManageCapability(body);
    if (!parsed.ok) return NextResponse.json(parsed.error, { status: 400 });
    const result = await manageCapability(
      { astraKey: identity.astraKey, userId, workspaceId: identity.workspaceId },
      parsed.value,
    );
    return NextResponse.json(result, { status: result.ok ? 200 : result.code === 'revision_conflict' ? 409 : 400 });
  } catch {
    return NextResponse.json(
      { ok: false, code: 'server_error', message: 'Scheduling is temporarily unavailable.', retryable: true },
      { status: 500 },
    );
  }
}
