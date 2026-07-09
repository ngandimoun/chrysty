import { NextResponse } from 'next/server';

import { requireLiveServiceAuth } from '@/lib/live/auth';
import { patchLiveSession } from '@/lib/live/db';
import type { LiveGuideSessionState, LiveSessionMode } from '@/lib/live/types';

export const runtime = 'nodejs';

export async function PATCH(request: Request) {
  const authError = requireLiveServiceAuth(request);
  if (authError) return authError;

  const body = (await request.json()) as {
    session_id?: string;
    mode?: LiveSessionMode;
    live_guide_state?: LiveGuideSessionState | null;
    resumption_handle?: string | null;
    pending_turn_id?: string | null;
  };

  const sessionId = body.session_id?.trim();
  if (!sessionId) {
    return NextResponse.json({ error: 'session_id is required.' }, { status: 400 });
  }

  await patchLiveSession(sessionId, {
    ...(body.mode ? { mode: body.mode } : {}),
    ...(body.live_guide_state !== undefined ? { live_guide_state: body.live_guide_state } : {}),
    ...(body.resumption_handle !== undefined ? { resumption_handle: body.resumption_handle } : {}),
    ...(body.pending_turn_id !== undefined ? { pending_turn_id: body.pending_turn_id } : {}),
  });

  return NextResponse.json({ ok: true });
}

export async function GET(request: Request) {
  const authError = requireLiveServiceAuth(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const turnId = url.searchParams.get('turn_id')?.trim();
  if (!turnId) {
    return NextResponse.json({ error: 'turn_id is required.' }, { status: 400 });
  }

  const { getLiveDelegation } = await import('@/lib/live/db');
  const delegation = await getLiveDelegation(turnId);
  if (!delegation) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  return NextResponse.json({
    turn_id: delegation.turn_id,
    status: delegation.status,
    spoken_summary: delegation.spoken_summary,
    error_message: delegation.error_message,
  });
}
