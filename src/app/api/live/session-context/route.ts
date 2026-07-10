import { NextResponse } from 'next/server';

import { requireLiveServiceAuth } from '@/lib/live/auth';
import { buildLiveSessionContext } from '@/lib/live/session-context';
import { resolveLiveAstraIdentity } from '@/lib/live/identity';
import { getLiveSession, upsertLiveSession } from '@/lib/live/db';
import { parseCompanionProfileFromJson } from '@/lib/live/parse-init';
import { parseUserContextFromJson } from '@/lib/live/parse-init';
import { getMem0MemoryUserId } from '@/lib/mem0/identity';
import type { CompanionProfile } from '@/lib/gemini/companion-profile';
import type { UserContext } from '@/lib/gemini/user-context';
import type { LiveSessionMode } from '@/lib/live/types';

export const runtime = 'nodejs';

interface SessionContextInput {
  sessionId: string;
  astraKey: string;
  mode: LiveSessionMode;
  resumptionHandle: string | null;
  companionProfile?: CompanionProfile;
  userContext?: UserContext;
  origin: string;
}

function parseMode(raw: string | undefined): LiveSessionMode {
  return raw === 'live_guide' ? 'live_guide' : 'default';
}

async function buildSessionContextResponse(
  request: Request,
  input: SessionContextInput,
): Promise<NextResponse> {
  const identity = await resolveLiveAstraIdentity(request, input.astraKey);
  if (identity instanceof NextResponse) return identity;
  const existingSession = await getLiveSession(input.sessionId);
  if (
    existingSession &&
    (existingSession.astra_key !== identity.astraKey ||
      existingSession.workspace_id !== identity.workspaceId)
  ) {
    return NextResponse.json({ error: 'Live session not found.' }, { status: 404 });
  }

  const memoryUserId = identity.userId
    ? getMem0MemoryUserId({ userId: identity.userId, astraKey: identity.astraKey })
    : identity.astraKey;

  await upsertLiveSession({
    session_id: input.sessionId,
    workspace_id: identity.workspaceId,
    astra_key: identity.astraKey,
    mode: input.mode,
    resumption_handle: input.resumptionHandle,
  });

  try {
    const context = await buildLiveSessionContext({
      session_id: input.sessionId,
      astra_key: identity.astraKey,
      workspace_id: identity.workspaceId,
      user_id: identity.userId || undefined,
      memory_user_id: memoryUserId,
      companion_profile: input.companionProfile,
      user_context: input.userContext,
      mode: input.mode,
      resumption_handle: input.resumptionHandle,
      origin: input.origin,
    });

    console.info('[live/session-context]', {
      session_id: input.sessionId,
      astra_key: identity.astraKey.slice(0, 8),
      mode: input.mode,
      history_turns: context.initial_history.length,
    });

    return NextResponse.json(context);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to build session context.';
    console.error('[live/session-context] build failed', {
      session_id: input.sessionId,
      astra_key: identity.astraKey.slice(0, 8),
      error: message,
    });
    return NextResponse.json({ error: 'Failed to build session context.' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const authError = requireLiveServiceAuth(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const sessionId = url.searchParams.get('session_id')?.trim();
  const astraKey = url.searchParams.get('astra_key')?.trim();
  const mode = parseMode(url.searchParams.get('mode') ?? undefined);
  const resumptionHandle = url.searchParams.get('resumption_handle')?.trim() || null;

  if (!sessionId || !astraKey) {
    return NextResponse.json({ error: 'session_id and astra_key are required.' }, { status: 400 });
  }

  let companionProfile;
  let userContext;
  try {
    companionProfile = parseCompanionProfileFromJson(url.searchParams.get('companion_profile'));
    userContext = parseUserContextFromJson(url.searchParams.get('user_context'));
  } catch {
    return NextResponse.json({ error: 'Invalid init JSON.' }, { status: 400 });
  }

  return buildSessionContextResponse(request, {
    sessionId,
    astraKey,
    mode,
    resumptionHandle,
    companionProfile,
    userContext,
    origin: url.origin,
  });
}

export async function POST(request: Request) {
  const authError = requireLiveServiceAuth(request);
  if (authError) return authError;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const sessionId = typeof body.session_id === 'string' ? body.session_id.trim() : '';
  const astraKey = typeof body.astra_key === 'string' ? body.astra_key.trim() : '';
  const mode = parseMode(typeof body.mode === 'string' ? body.mode : undefined);
  const resumptionHandle =
    typeof body.resumption_handle === 'string' ? body.resumption_handle.trim() || null : null;

  if (!sessionId || !astraKey) {
    return NextResponse.json({ error: 'session_id and astra_key are required.' }, { status: 400 });
  }

  let companionProfile;
  let userContext;
  try {
    companionProfile =
      body.companion_profile && typeof body.companion_profile === 'object'
        ? parseCompanionProfileFromJson(JSON.stringify(body.companion_profile))
        : undefined;
    userContext =
      body.user_context && typeof body.user_context === 'object'
        ? parseUserContextFromJson(JSON.stringify(body.user_context))
        : undefined;
  } catch {
    return NextResponse.json({ error: 'Invalid init JSON.' }, { status: 400 });
  }

  const origin = new URL(request.url).origin;

  return buildSessionContextResponse(request, {
    sessionId,
    astraKey,
    mode,
    resumptionHandle,
    companionProfile,
    userContext,
    origin,
  });
}
