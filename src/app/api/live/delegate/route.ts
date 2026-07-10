import { NextResponse } from 'next/server';

import { listBackgroundJobs } from '@/lib/background-jobs/db';
import { isBackgroundJobsEnabled, resolveJobOrigin } from '@/lib/background-jobs/kickoff';
import { summarizeJobsForPrompt } from '@/lib/gemini/background-delegation';
import { createLiveDelegation, getLiveSession, patchLiveSession } from '@/lib/live/db';
import { requireLiveServiceAuth } from '@/lib/live/auth';
import { resolveLiveAstraIdentity } from '@/lib/live/identity';
import { compactObjectiveEnvelope } from '@/lib/live/objective';
import type { LiveDelegateRequest } from '@/lib/live/types';
import { createTurnId } from '@/lib/live/types';
import { isSupabaseConfigured } from '@/lib/supabase/admin';
import { normalizeBcp47 } from '@/lib/language/language-resolution';

export const runtime = 'nodejs';

const DEFAULT_ACK = "I'm on that now — give me a moment.";

export async function POST(request: Request) {
  const startedAt = performance.now();
  const authError = requireLiveServiceAuth(request);
  if (authError) return authError;

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  }

  const body = (await request.json()) as Partial<LiveDelegateRequest> & {
    astra_key?: string;
    spoken_ack?: string;
  };

  const astraKey = body.astra_key?.trim();
  const sessionId = body.session_id?.trim();
  const transcript = body.transcript?.trim();

  if (!astraKey || !sessionId || !transcript) {
    return NextResponse.json({ error: 'astra_key, session_id, and transcript are required.' }, { status: 400 });
  }

  const identity = await resolveLiveAstraIdentity(request, astraKey);
  if (identity instanceof NextResponse) return identity;
  const session = await getLiveSession(sessionId);
  if (
    !session ||
    session.astra_key !== identity.astraKey ||
    session.workspace_id !== identity.workspaceId
  ) {
    return NextResponse.json({ error: 'Live session not found.' }, { status: 404 });
  }

  const turnId = body.turn_id?.trim() || createTurnId();
  const delegateRequest: LiveDelegateRequest = {
    turn_id: turnId,
    session_id: sessionId,
    transcript,
    user_intent: body.user_intent?.trim(),
    visual_context: body.visual_context?.trim(),
    objective_envelope: compactObjectiveEnvelope(body.objective_envelope),
    mode: body.mode === 'live_guide' ? 'live_guide' : 'default',
    user_context: body.user_context,
    companion_profile: body.companion_profile,
    request_language: normalizeBcp47(body.request_language),
    images: body.images,
  };

  const record = await createLiveDelegation({
    turn_id: turnId,
    session_id: sessionId,
    workspace_id: identity.workspaceId,
    astra_key: identity.astraKey,
    user_id: identity.userId || undefined,
    request: delegateRequest,
  });

  if (!record) {
    return NextResponse.json({ error: 'Failed to queue delegation.' }, { status: 500 });
  }

  await patchLiveSession(sessionId, { pending_turn_id: turnId });

  const ackMs = performance.now() - startedAt;
  if (ackMs > 200) {
    console.warn('[live/delegate] slow ack', { turn_id: turnId, ackMs: Math.round(ackMs) });
  }

  console.info('[live/delegate] queued', {
    turn_id: turnId,
    session_id: sessionId,
    ackMs: Math.round(ackMs),
  });

  return NextResponse.json({
    turn_id: turnId,
    status: 'processing',
    spoken_ack: body.spoken_ack?.trim() || DEFAULT_ACK,
  });
}

export async function GET(request: Request) {
  const authError = requireLiveServiceAuth(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const sessionId = url.searchParams.get('session_id')?.trim();
  const astraKey = url.searchParams.get('astra_key')?.trim();

  if (!sessionId || !astraKey) {
    return NextResponse.json({ error: 'session_id and astra_key are required.' }, { status: 400 });
  }

  const identity = await resolveLiveAstraIdentity(request, astraKey);
  if (identity instanceof NextResponse) return identity;
  const session = await getLiveSession(sessionId);
  if (
    !session ||
    session.astra_key !== identity.astraKey ||
    session.workspace_id !== identity.workspaceId
  ) {
    return NextResponse.json({ error: 'Live session not found.' }, { status: 404 });
  }

  const jobs = isBackgroundJobsEnabled()
    ? await listBackgroundJobs(identity.astraKey, 8).catch(() => [])
    : [];

  return NextResponse.json({
    job_summaries: summarizeJobsForPrompt(jobs),
    origin: resolveJobOrigin(request.url),
    workspace_id: identity.workspaceId,
    user_id: identity.userId || null,
  });
}
