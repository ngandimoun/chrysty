import { GoogleGenAI } from '@google/genai';
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
import {
  getLiveDelegation,
  patchLiveSession,
  updateLiveDelegation,
  updateLiveDelegationRequest,
} from '@/lib/live/db';
import { streamLiveDelegationToEncoder } from '@/lib/live/delegate-pipeline';
import { formatObjectiveEnvelope } from '@/lib/live/objective';
import { encodeSseEvent } from '@/lib/live/sse';
import { insertConversationTurn } from '@/lib/astra/db/conversation-history';
import { persistTurnToMem0 } from '@/lib/mem0/persist';
import { getMem0MemoryUserId } from '@/lib/mem0/identity';
import { isSupabaseConfigured } from '@/lib/supabase/admin';
import type {
  LiveDelegateRequest,
  LiveDelegationResult,
  LiveDelegationStage,
} from '@/lib/live/types';
import type { CaptureMode, FocusAnnotation, FocusAnnotationShape } from '@/lib/camera/types';

export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_CAPTURE_COUNT = 7;
const MAX_CAPTURE_BYTES = 5 * 1024 * 1024;
const MAX_FOCUS_ANNOTATIONS = 8;
const ALLOWED_CAPTURE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function parseCaptureMode(raw: unknown): CaptureMode | undefined {
  return raw === 'none' || raw === 'photo' || raw === 'smart_snapshot' ? raw : undefined;
}

function parseFocusAnnotationShape(raw: unknown): FocusAnnotationShape | null {
  return raw === 'circle' ||
    raw === 'rect' ||
    raw === 'highlight' ||
    raw === 'arrow' ||
    raw === 'pointer'
    ? raw
    : null;
}

function parseNormalizedNumber(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 && raw <= 1
    ? raw
    : null;
}

function parseFocusAnnotations(raw: unknown): FocusAnnotation[] | undefined {
  if (!Array.isArray(raw)) return undefined;

  const parsed: FocusAnnotation[] = [];
  for (const item of raw.slice(0, MAX_FOCUS_ANNOTATIONS)) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const shape = parseFocusAnnotationShape(record.shape);
    const x = parseNormalizedNumber(record.x);
    const y = parseNormalizedNumber(record.y);
    const width = parseNormalizedNumber(record.width);
    const height = parseNormalizedNumber(record.height);
    if (!shape || x === null || y === null || width === null || height === null) continue;
    if (x + width > 1 || y + height > 1) continue;

    const startX = record.startX === undefined ? undefined : parseNormalizedNumber(record.startX);
    const startY = record.startY === undefined ? undefined : parseNormalizedNumber(record.startY);
    const endX = record.endX === undefined ? undefined : parseNormalizedNumber(record.endX);
    const endY = record.endY === undefined ? undefined : parseNormalizedNumber(record.endY);
    if (startX === null || startY === null || endX === null || endY === null) continue;

    parsed.push({
      id: String(record.id ?? '').slice(0, 64) || `focus-${parsed.length + 1}`,
      shape,
      x,
      y,
      width,
      height,
      ...(startX !== undefined ? { startX } : {}),
      ...(startY !== undefined ? { startY } : {}),
      ...(endX !== undefined ? { endX } : {}),
      ...(endY !== undefined ? { endY } : {}),
    });
  }

  return parsed.length > 0 ? parsed : undefined;
}

function encodeResultReplay(turnId: string, result: LiveDelegationResult): string {
  let output = '';
  if (result.live_guide || result.guidance_mode !== 'static') {
    output += encodeSseEvent('live_guide', {
      turn_id: turnId,
      liveGuide: result.live_guide ?? null,
      guidanceMode: result.guidance_mode ?? 'static',
      monitor: false,
      cached: true,
    });
  }
  if (result.show_explanation) {
    output += encodeSseEvent('explanation_start', {
      turn_id: turnId,
      ...result.visuals,
      cached: true,
    });
    output += encodeSseEvent('explanation_done', {
      turn_id: turnId,
      text: result.explanation_text,
      ...result.visuals,
      cached: true,
    });
  }
  output += encodeSseEvent('done', {
    turn_id: turnId,
    spoken_transcript: result.spoken_summary,
    timings: result.timings,
    cached: true,
  });
  return output;
}

async function readStreamInput(request: Request): Promise<{
  turnId: string | null;
  images: NonNullable<LiveDelegateRequest['images']>;
}> {
  if (request.method !== 'POST') {
    return {
      turnId: new URL(request.url).searchParams.get('turn_id')?.trim() ?? null,
      images: [],
    };
  }

  const form = await request.formData();
  const turnId = String(form.get('turn_id') ?? '').trim() || null;
  const metadata = JSON.parse(String(form.get('imagesMeta') ?? '[]')) as Array<{
    imageId?: string;
    width?: number;
    height?: number;
    captureMode?: unknown;
    focusAnnotations?: unknown;
  }>;
  const files = form.getAll('images').filter((entry): entry is File => entry instanceof File);
  if (files.length > MAX_CAPTURE_COUNT) {
    throw new Error(`A maximum of ${MAX_CAPTURE_COUNT} captures can be attached.`);
  }

  const images = await Promise.all(
    files.map(async (file, index) => {
      if (!ALLOWED_CAPTURE_TYPES.has(file.type) || file.size > MAX_CAPTURE_BYTES) {
        throw new Error('One of the attached captures is unsupported or too large.');
      }
      const meta = metadata[index];
      const focusAnnotations = parseFocusAnnotations(meta?.focusAnnotations);
      const captureMode = parseCaptureMode(meta?.captureMode);
      return {
        image_id: meta?.imageId?.slice(0, 96),
        mime_type: file.type,
        data_base64: Buffer.from(await file.arrayBuffer()).toString('base64'),
        width: meta?.width,
        height: meta?.height,
        ...(captureMode ? { capture_mode: captureMode } : {}),
        ...(focusAnnotations ? { focus_annotations: focusAnnotations } : {}),
      };
    }),
  );
  return { turnId, images };
}

async function handleStream(request: Request) {
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

  let input;
  try {
    input = await readStreamInput(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid capture upload.';
    return new Response(encodeSseEvent('error', { message }), {
      status: 400,
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    });
  }
  const turnId = input.turnId;
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
    if (delegation.result) {
      return new Response(encodeResultReplay(turnId, delegation.result), {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      });
    }
    return new Response(
      encodeSseEvent('done', {
        turn_id: turnId,
        spoken_transcript: delegation.spoken_summary ?? '',
        timings: {
          sttMs: 0,
          llmMs: 0,
          ttsMs: 0,
          ttsFirstAudioMs: null,
          totalMs: 0,
          audioDurationMs: 0,
        },
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
  const requestWithCaptures: LiveDelegateRequest =
    input.images.length > 0
      ? { ...delegation.request, images: input.images }
      : delegation.request;
  if (input.images.length > 0) {
    await updateLiveDelegationRequest(turnId, requestWithCaptures);
  }

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

  const images: MultimodalImageInput[] = (requestWithCaptures.images ?? []).map((image, index) => ({
    imageId: image.image_id ?? `capture-${index + 1}`,
    bytes: Buffer.from(image.data_base64, 'base64'),
    mimeType: image.mime_type,
    width: image.width,
    height: image.height,
    captureMode: image.capture_mode,
    focusAnnotations: image.focus_annotations,
  }));

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const enqueue = (chunk: Uint8Array) => controller.enqueue(chunk);

      let currentStage: LiveDelegationStage = 'analyzing';
      try {
        await updateLiveDelegation(turnId, { status: 'running', stage: currentStage });

        const client = new GoogleGenAI({ apiKey: getGeminiApiKey() });
        const ecosystemActivity = await fetchUserEcosystemActivity(identity.userId);

        const transcriptWithVisualContext = [
          requestWithCaptures.objective_envelope
            ? formatObjectiveEnvelope(requestWithCaptures.objective_envelope)
            : requestWithCaptures.transcript,
          requestWithCaptures.objective_envelope
            ? `Legacy conversation context:\n${requestWithCaptures.transcript}`
            : '',
          requestWithCaptures.visual_context
            ? `Live visual context:\n${requestWithCaptures.visual_context}`
            : '',
        ]
          .filter(Boolean)
          .join('\n\n');
        const { spoken_summary, transcript, result } = await streamLiveDelegationToEncoder(
          client,
          encoder,
          enqueue,
          {
            turn_id: turnId,
            transcript: transcriptWithVisualContext,
            images: images.length > 0 ? images : undefined,
            userContext: requestWithCaptures.user_context,
            companionProfile: requestWithCaptures.companion_profile,
            memoryContext: {
              workspaceId: workspace.id,
              astraKey: identity.astraKey,
              memoryUserId,
              userId: identity.userId,
            },
            delegation: delegationPrompt,
            ecosystemActivity,
            liveGuide:
              requestWithCaptures.mode === 'live_guide'
                ? { active: true }
                : undefined,
            explicitArtifactLanguage:
              requestWithCaptures.objective_envelope?.language.resolved ?? null,
            requestLanguage: requestWithCaptures.request_language,
            onStage: async (stage) => {
              currentStage = stage;
              await updateLiveDelegation(turnId, { stage });
            },
          },
        );

        await updateLiveDelegation(turnId, {
          status: 'completed',
          stage: 'completed',
          result,
          spoken_summary,
          error_message: null,
          error_code: null,
          error_stage: null,
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
        const errorCode = `live-delegation-${turnId}`;
        await updateLiveDelegation(turnId, {
          status: 'failed',
          stage: 'failed',
          error_message: message,
          error_code: errorCode,
          error_stage: currentStage,
        });
        enqueue(
          encoder.encode(
            encodeSseEvent('error', {
              turn_id: turnId,
              message: 'Chrysty could not finish that task. Please try again.',
              error_code: errorCode,
              stage: currentStage,
            }),
          ),
        );
        console.error('[live/delegate/stream] failed', {
          turn_id: turnId,
          error_code: errorCode,
          stage: currentStage,
          message,
        });
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

export async function GET(request: Request) {
  return handleStream(request);
}

export async function POST(request: Request) {
  return handleStream(request);
}
