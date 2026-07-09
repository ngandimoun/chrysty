import { NextResponse } from 'next/server';

import { insertConversationTurn } from '@/lib/astra/db/conversation-history';
import { requireLiveServiceAuth } from '@/lib/live/auth';
import { resolveLiveAstraIdentity } from '@/lib/live/identity';
import { persistTurnToMem0 } from '@/lib/mem0/persist';
import { getMem0MemoryUserId } from '@/lib/mem0/identity';
import { isSupabaseConfigured } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const authError = requireLiveServiceAuth(request);
  if (authError) return authError;

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  }

  const body = (await request.json()) as {
    astra_key?: string;
    session_id?: string;
    user_transcript?: string;
    assistant_spoken?: string;
    has_images?: boolean;
    metadata?: Record<string, unknown>;
  };

  const astraKey = body.astra_key?.trim();
  const userTranscript = body.user_transcript?.trim();
  const assistantSpoken = body.assistant_spoken?.trim() ?? '';

  if (!astraKey || !userTranscript) {
    return NextResponse.json({ error: 'astra_key and user_transcript are required.' }, { status: 400 });
  }

  const identity = await resolveLiveAstraIdentity(request, astraKey);
  if (identity instanceof NextResponse) return identity;

  await insertConversationTurn({
    workspaceId: identity.workspaceId,
    userId: identity.userId || undefined,
    astraKey: identity.astraKey,
    transcript: userTranscript,
    spoken: assistantSpoken,
    hasImages: body.has_images ?? false,
    metadata: {
      source: 'live',
      session_id: body.session_id ?? null,
      ...(body.metadata ?? {}),
    },
  });

  if (identity.userId) {
    const memoryUserId = getMem0MemoryUserId({
      userId: identity.userId,
      astraKey: identity.astraKey,
    });
    const assistantContextText = assistantSpoken;
    void persistTurnToMem0(memoryUserId, userTranscript, assistantContextText).catch((error) => {
      console.error('[live/persist-turn] mem0 failed', error);
    });
  }

  return NextResponse.json({ ok: true });
}
