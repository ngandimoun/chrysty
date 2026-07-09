import { GoogleGenAI } from '@google/genai';
import { NextResponse } from 'next/server';

import { requireAstraIdentity, respondAstraIdentityError } from '@/lib/astra/guard';
import { fetchUserEcosystemActivity } from '@/lib/astra/ecosystem-activity';
import { ensureAstraWorkspace } from '@/lib/astra/workspace';
import { listBackgroundJobs } from '@/lib/background-jobs/db';
import { isBackgroundJobsEnabled, resolveJobOrigin } from '@/lib/background-jobs/kickoff';
import { summarizeJobsForPrompt } from '@/lib/gemini/background-delegation';
import { getGeminiApiKey } from '@/lib/gemini/config';
import type { DelegationPromptContext, MultimodalImageInput } from '@/lib/gemini/response-prompt';
import {
  PlatformAccessError,
  requirePlatformAccessFromRequest,
} from '@/lib/chrysty/guard';
import { getLiveDelegation, patchLiveSession, updateLiveDelegation } from '@/lib/live/db';
import { streamLiveDelegationToEncoder } from '@/lib/live/delegate-pipeline';
import { encodeSseEvent } from '@/lib/live/sse';
import { insertConversationTurn } from '@/lib/astra/db/conversation-history';
import { persistTurnToMem0 } from '@/lib/mem0/persist';
import { getMem0MemoryUserId } from '@/lib/mem0/identity';
import { isSupabaseConfigured } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return new Response(encodeSseEvent('error', { message: 'Supabase is not configured.' }), {
      status: 503,
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    });
  }

  try {
    await requirePlatformAccessFromRequest(request);
  } catch (error) {
    if (error instanceof PlatformAccessError) {
      return new Response(encodeSseEvent('error', { message: error.message }), {
        status: error.status,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      });
    }
    throw error;
  }

  const url = new URL(request.url);
  const turnId = url.searchParams.get('turn_id')?.trim();
  if (!turnId) {
    return new Response(encodeSseEvent('error', { message: 'turn_id is required.' }), {
      status: 400,
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    });
  }

  let identity;
  try {
    identity = await requireAstraIdentity(request, { ensureWorkspace: false });
  } catch (error) {
    const response = respondAstraIdentityError(error);
    if (response) {
      const body = await response.json().catch(() => ({ error: 'Authentication required.' }));
      return new Response(encodeSseEvent('error', body), {
        status: response.status,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      });
    }
    throw error;
  }

  const delegation = await getLiveDelegation(turnId);
  if (!delegation || delegation.astra_key !== identity.astraKey) {
    return new Response(encodeSseEvent('error', { message: 'Delegation not found.' }), {
      status: 404,
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    });
  }

  if (delegation.status === 'completed') {
    return new Response(
      encodeSseEvent('done', {
        turn_id: turnId,
        spoken_transcript: delegation.spoken_summary ?? '',
        cached: true,
      }),
      { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } },
    );
  }

  if (delegation.status === 'failed') {
    return new Response(
      encodeSseEvent('error', { message: delegation.error_message ?? 'Delegation failed.' }),
      { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } },
    );
  }

  const workspace = await ensureAstraWorkspace(identity.astraKey, identity.userId);
  const memoryUserId = getMem0MemoryUserId(identity);

  let delegationPrompt: DelegationPromptContext | undefined;
  if (isBackgroundJobsEnabled()) {
    const jobs = await listBackgroundJobs(identity.astraKey, 8).catch(() => []);
    delegationPrompt = {
      toolContext: {
        astraKey: identity.astraKey,
        workspaceId: workspace.id,
        userId: identity.userId,
        origin: resolveJobOrigin(request.url),
      },
      jobSummaries: summarizeJobsForPrompt(jobs),
    };
  }

  const images: MultimodalImageInput[] = (delegation.request.images ?? []).map((image, index) => ({
    imageId: image.image_id ?? `capture-${index + 1}`,
    bytes: Buffer.from(image.data_base64, 'base64'),
    mimeType: image.mime_type,
    width: image.width,
    height: image.height,
  }));

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const enqueue = (chunk: Uint8Array) => controller.enqueue(chunk);

      try {
        await updateLiveDelegation(turnId, { status: 'running' });

        const client = new GoogleGenAI({ apiKey: getGeminiApiKey() });
        const ecosystemActivity = await fetchUserEcosystemActivity(identity.userId);

        const { spoken_summary, transcript } = await streamLiveDelegationToEncoder(
          client,
          encoder,
          enqueue,
          {
            turn_id: turnId,
            transcript: delegation.request.transcript,
            images: images.length > 0 ? images : undefined,
            userContext: delegation.request.user_context,
            companionProfile: delegation.request.companion_profile,
            memoryContext: {
              workspaceId: workspace.id,
              astraKey: identity.astraKey,
              memoryUserId,
              userId: identity.userId,
            },
            delegation: delegationPrompt,
            ecosystemActivity,
            liveGuide:
              delegation.request.mode === 'live_guide'
                ? { active: true }
                : undefined,
          },
        );

        await updateLiveDelegation(turnId, {
          status: 'completed',
          spoken_summary,
        });
        await patchLiveSession(delegation.session_id, { pending_turn_id: null });

        await insertConversationTurn({
          workspaceId: workspace.id,
          userId: identity.userId,
          astraKey: identity.astraKey,
          transcript,
          spoken: spoken_summary,
          hasImages: images.length > 0,
          metadata: { source: 'live-delegate', turn_id: turnId, session_id: delegation.session_id },
        });

        void persistTurnToMem0(
          memoryUserId,
          transcript,
          spoken_summary,
        ).catch((error) => console.error('[live/delegate/stream] mem0 failed', error));

        console.info('[live/delegate/stream] completed', { turn_id: turnId });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Delegation stream failed.';
        await updateLiveDelegation(turnId, { status: 'failed', error_message: message });
        enqueue(encoder.encode(encodeSseEvent('error', { turn_id: turnId, message })));
        console.error('[live/delegate/stream] failed', { turn_id: turnId, message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
