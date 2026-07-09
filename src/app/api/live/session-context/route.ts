import { NextResponse } from 'next/server';

import { requireLiveServiceAuth } from '@/lib/live/auth';
import { buildLiveSessionContext } from '@/lib/live/session-context';
import { resolveLiveAstraIdentity } from '@/lib/live/identity';
import { upsertLiveSession } from '@/lib/live/db';
import { parseCompanionProfileFromJson } from '@/lib/live/parse-init';
import { parseUserContextFromJson } from '@/lib/live/parse-init';
import { getMem0MemoryUserId } from '@/lib/mem0/identity';
import type { LiveSessionMode } from '@/lib/live/types';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const authError = requireLiveServiceAuth(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const sessionId = url.searchParams.get('session_id')?.trim();
  const astraKey = url.searchParams.get('astra_key')?.trim();
  const mode = (url.searchParams.get('mode') === 'live_guide' ? 'live_guide' : 'default') as LiveSessionMode;
  const resumptionHandle = url.searchParams.get('resumption_handle')?.trim() || null;

  if (!sessionId || !astraKey) {
    return NextResponse.json({ error: 'session_id and astra_key are required.' }, { status: 400 });
  }

  const identity = await resolveLiveAstraIdentity(request, astraKey);
  if (identity instanceof NextResponse) return identity;

  let companionProfile;
  let userContext;
  try {
    companionProfile = parseCompanionProfileFromJson(url.searchParams.get('companion_profile'));
    userContext = parseUserContextFromJson(url.searchParams.get('user_context'));
  } catch {
    return NextResponse.json({ error: 'Invalid init JSON.' }, { status: 400 });
  }

  const memoryUserId = identity.userId
    ? getMem0MemoryUserId({ userId: identity.userId, astraKey: identity.astraKey })
    : identity.astraKey;

  await upsertLiveSession({
    session_id: sessionId,
    workspace_id: identity.workspaceId,
    astra_key: identity.astraKey,
    mode,
    resumption_handle: resumptionHandle,
  });

  const context = await buildLiveSessionContext({
    session_id: sessionId,
    astra_key: identity.astraKey,
    workspace_id: identity.workspaceId,
    user_id: identity.userId || undefined,
    memory_user_id: memoryUserId,
    companion_profile: companionProfile,
    user_context: userContext,
    mode,
    resumption_handle: resumptionHandle,
    origin: url.origin,
  });

  console.info('[live/session-context]', {
    session_id: sessionId,
    astra_key: identity.astraKey.slice(0, 8),
    mode,
    history_turns: context.initial_history.length,
  });

  return NextResponse.json(context);
}
