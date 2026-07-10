import { GoogleGenAI } from '@google/genai';

import { requireAstraIdentity, respondAstraIdentityError } from '@/lib/astra/guard';
import {
  PlatformAccessError,
  requirePlatformAccessFromRequest,
} from '@/lib/chrysty/guard';
import { trackAgentUsage } from '@/lib/chrysty/track-usage';
import { insertConversationTurn } from '@/lib/astra/db/conversation-history';
import { fetchUserEcosystemActivity } from '@/lib/astra/ecosystem-activity';
import { ensureAstraWorkspace } from '@/lib/astra/workspace';
import { listBackgroundJobs } from '@/lib/background-jobs/db';
import { isBackgroundJobsEnabled, resolveJobOrigin } from '@/lib/background-jobs/kickoff';
import { isSupabaseConfigured } from '@/lib/supabase/admin';
import { buildAssistantContextText } from '@/lib/gemini/assistant-context-text';
import { summarizeJobsForPrompt } from '@/lib/gemini/background-delegation';
import { getGeminiApiKey } from '@/lib/gemini/config';
import {
  buildVoiceResponseFromMultimodal,
  type DelegationPromptContext,
  LIVE_GUIDE_BOOTSTRAP_TRANSCRIPT,
  type LiveGuideTurnOptions,
} from '@/lib/gemini/response-prompt';
import { formatUserFacingGeminiError } from '@/lib/gemini/user-facing-error';
import { parseCompanionProfileFromFormData } from '@/lib/gemini/companion-profile';
import { parseReferenceDocumentInputs } from '@/lib/gemini/reference-documents';
import { speakOnceResilient } from '@/lib/gemini/speak';
import { stripGoogleMapsSourcesFromExplanation } from '@/lib/gemini/tool-grounding';
import { parseUserContextFromFormData } from '@/lib/gemini/user-context';
import {
  chunkExplanationText,
  type PhysicalTaskResponse,
  type VisualGuidanceResponse,
} from '@/lib/gemini/voice-response-schema';
import { getMem0MemoryUserId } from '@/lib/mem0/identity';
import { buildPexelsStockImageGroups } from '@/lib/pexels/photos';
import { persistTurnToMem0 } from '@/lib/mem0/persist';
import type { MemoryContext } from '@/lib/mem0/types';
import type { CaptureMode, FocusAnnotation, FocusAnnotationShape } from '@/lib/camera/types';
import { MAX_PENDING_PHOTOS } from '@/lib/camera/types';
import type { ResponseTimings } from '@/lib/gemini/config';
import type { PerceptionSnapshot } from '@/lib/perception/types';
import { sanitizePerceptionSnapshot } from '@/lib/perception/validate';
import { filterRelevantVisualImageGroupRequests } from '@/lib/visuals/stock-images';

export const runtime = 'nodejs';

const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function shouldDebugResponseStream(): boolean {
  return process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_DEBUG_RESPONSE_STREAM === 'true';
}

interface ParsedImageMeta {
  imageId?: string;
  mimeType: string;
  width?: number;
  height?: number;
  captureMode?: CaptureMode;
  focusAnnotations?: FocusAnnotation[];
  perception?: PerceptionSnapshot;
}

function encodeSseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function countVisualGuidance(guidance: VisualGuidanceResponse | null | undefined) {
  return {
    hasVisualGuidance: Boolean(guidance),
    sceneItems: guidance?.scene_items.length ?? 0,
    overlays: guidance?.overlays.length ?? 0,
    cards: guidance?.cards.length ?? 0,
    differences: guidance?.differences.length ?? 0,
  };
}

function buildVisualGuidanceFromPhysicalTask(
  physicalTask: PhysicalTaskResponse | null,
  images: Array<{ imageId?: string }>,
): VisualGuidanceResponse | null {
  if (!physicalTask) return null;

  const defaultImageId = images[0]?.imageId || 'capture-1';
  const sceneItems = physicalTask.visual_annotations
    .filter((annotation) => annotation.x !== undefined && annotation.y !== undefined)
    .slice(0, 8)
    .map((annotation, index) => {
      const itemId = `physical-item-${index + 1}`;
      const imageId = annotation.image_id ?? defaultImageId;
      const displayNumber = annotation.display_number ?? index + 1;
      return {
        item_id: itemId,
        display_number: displayNumber,
        name: annotation.label,
        image_id: imageId,
        point: { x: annotation.x ?? 0.5, y: annotation.y ?? 0.5 },
        ...(annotation.width !== undefined && annotation.height !== undefined
          ? {
              bbox: {
                x: annotation.x ?? 0,
                y: annotation.y ?? 0,
                width: annotation.width,
                height: annotation.height,
              },
            }
          : {}),
        ...(annotation.confidence ? { confidence: annotation.confidence } : {}),
      };
    });

  if (sceneItems.length === 0 && physicalTask.next_actions.length === 0) {
    return null;
  }

  const overlays = sceneItems
    .filter((item) => item.bbox)
    .map((item, index) => ({
      id: `physical-overlay-${index + 1}`,
      type: 'box' as const,
      image_id: item.image_id,
      item_id: item.item_id,
      label: item.name,
      x: item.bbox!.x,
      y: item.bbox!.y,
      width: item.bbox!.width,
      height: item.bbox!.height,
      sequence: index,
      ...(item.confidence ? { confidence: item.confidence } : {}),
    }));

  const primaryImageId = sceneItems[0]?.image_id ?? defaultImageId;
  const firstAction = physicalTask.next_actions[0];
  const activeCardId = firstAction ? 'physical-active-step' : 'physical-image-index';
  const cards = [
    ...(sceneItems.length > 0
      ? [
          {
            id: 'physical-image-index',
            kind: 'image_index' as const,
            title: 'Visible items',
            body: sceneItems.map((item) => `${item.display_number}. ${item.name}`).join('\n'),
            image_id: primaryImageId,
            related_item_ids: sceneItems.map((item) => item.item_id),
          },
        ]
      : []),
    ...(firstAction
      ? [
          {
            id: 'physical-active-step',
            kind: 'active_step' as const,
            title: firstAction.title,
            body: firstAction.detail ?? firstAction.check ?? firstAction.why,
            image_id: primaryImageId,
            related_item_ids: sceneItems.map((item) => item.item_id),
            step_number: 1,
          },
        ]
      : []),
  ];

  return {
    primary_image_id: primaryImageId,
    active_card_id: activeCardId,
    ...(physicalTask.task_state?.stage ? { current_state: physicalTask.task_state.stage } : {}),
    scene_items: sceneItems,
    overlays,
    cards,
    differences: [],
  };
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

function parseNormalizedValue(raw: unknown): number | null {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    return null;
  }
  return value;
}

function parseCaptureMode(raw: unknown, fallback: CaptureMode): CaptureMode {
  return raw === 'none' ||
    raw === 'photo' ||
    raw === 'smart_snapshot'
    ? raw
    : fallback;
}

type RequestMode = 'default' | 'live_guide' | 'live_guide_monitor' | 'live_guide_bootstrap';

function parseRequestMode(raw: unknown): RequestMode {
  return raw === 'live_guide' ||
    raw === 'live_guide_monitor' ||
    raw === 'live_guide_bootstrap'
    ? raw
    : 'default';
}

const MAX_LIVE_GUIDE_CONTEXT_CHARS = 600;

function parseLiveGuideContext(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, MAX_LIVE_GUIDE_CONTEXT_CHARS);
}

function parseFocusAnnotation(raw: unknown): FocusAnnotation {
  if (typeof raw !== 'object') {
    throw new Error('Invalid focus annotation metadata.');
  }

  const record = raw as Record<string, unknown>;
  const id = String(record.id ?? '').trim();
  const shape = parseFocusAnnotationShape(record.shape);
  const x = parseNormalizedValue(record.x);
  const y = parseNormalizedValue(record.y);
  const width = parseNormalizedValue(record.width);
  const height = parseNormalizedValue(record.height);
  const startX = record.startX == null ? undefined : parseNormalizedValue(record.startX);
  const startY = record.startY == null ? undefined : parseNormalizedValue(record.startY);
  const endX = record.endX == null ? undefined : parseNormalizedValue(record.endX);
  const endY = record.endY == null ? undefined : parseNormalizedValue(record.endY);

  if (!id || !shape || x === null || y === null || width === null || height === null) {
    throw new Error('Invalid focus annotation metadata.');
  }

  if (startX === null || startY === null || endX === null || endY === null) {
    throw new Error('Invalid focus annotation metadata.');
  }

  if (x + width > 1 || y + height > 1) {
    throw new Error('Focus annotation exceeds image bounds.');
  }

  return {
    id,
    shape,
    x,
    y,
    width,
    height,
    ...(startX !== undefined ? { startX } : {}),
    ...(startY !== undefined ? { startY } : {}),
    ...(endX !== undefined ? { endX } : {}),
    ...(endY !== undefined ? { endY } : {}),
  };
}

function parseFocusAnnotations(raw: unknown): FocusAnnotation[] | undefined {
  if (raw == null) return undefined;
  if (!Array.isArray(raw)) {
    throw new Error('Invalid focus annotation metadata.');
  }

  return raw.map((item) => parseFocusAnnotation(item));
}

function parseImagesMeta(raw: string | null): ParsedImageMeta[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => {
      const record = item as Record<string, unknown>;
      const imageId = String(record.imageId ?? record.image_id ?? '').trim();
      return {
        ...(imageId ? { imageId } : {}),
        mimeType: String(record.mimeType ?? 'image/jpeg'),
        width: Number(record.width) || undefined,
        height: Number(record.height) || undefined,
        captureMode: parseCaptureMode(record.captureMode, 'photo'),
        focusAnnotations: parseFocusAnnotations(record.focusAnnotations),
        perception: sanitizePerceptionSnapshot(record.perception),
      };
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('focus annotation')) {
      throw error;
    }
    return [];
  }
}

async function parseImageInputs(formData: FormData) {
  const imageFiles = formData
    .getAll('images')
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (imageFiles.length > 0) {
    if (imageFiles.length > MAX_PENDING_PHOTOS) {
      throw new Error(`Too many images. Maximum is ${MAX_PENDING_PHOTOS}.`);
    }

    const meta = parseImagesMeta(String(formData.get('imagesMeta') ?? ''));
    if (meta.length > 0 && meta.length !== imageFiles.length) {
      throw new Error('Image metadata count does not match uploaded images.');
    }

    const images = [];
    for (let index = 0; index < imageFiles.length; index += 1) {
      const file = imageFiles[index]!;
      if (file.size > MAX_IMAGE_BYTES) {
        throw new Error('Image file exceeds the 10 MB limit.');
      }

      const itemMeta = meta[index];
      images.push({
        imageId: itemMeta?.imageId || `capture-${index + 1}`,
        bytes: Buffer.from(await file.arrayBuffer()),
        mimeType: itemMeta?.mimeType || file.type || 'image/jpeg',
        captureMode: itemMeta?.captureMode ?? 'photo',
        ...(itemMeta?.width ? { width: itemMeta.width } : {}),
        ...(itemMeta?.height ? { height: itemMeta.height } : {}),
        ...(itemMeta?.focusAnnotations?.length
          ? { focusAnnotations: itemMeta.focusAnnotations }
          : {}),
        ...(itemMeta?.perception ? { perception: itemMeta.perception } : {}),
      });
    }

    return images;
  }

  const legacyImage = formData.get('image');
  if (!(legacyImage instanceof File) || legacyImage.size === 0) {
    return [];
  }

  if (legacyImage.size > MAX_IMAGE_BYTES) {
    throw new Error('Image file exceeds the 10 MB limit.');
  }

  const imageMimeType = String(formData.get('imageMimeType') ?? '');
  const captureMode = parseCaptureMode(formData.get('captureMode'), 'none');
  const imageWidth = Number(formData.get('imageWidth') ?? 0);
  const imageHeight = Number(formData.get('imageHeight') ?? 0);

  return [
    {
      bytes: Buffer.from(await legacyImage.arrayBuffer()),
      imageId: 'capture-1',
      mimeType: imageMimeType || legacyImage.type || 'image/jpeg',
      captureMode,
      ...(Number.isFinite(imageWidth) && imageWidth > 0 ? { width: imageWidth } : {}),
      ...(Number.isFinite(imageHeight) && imageHeight > 0 ? { height: imageHeight } : {}),
    },
  ];
}

export async function POST(request: Request) {
  const pipelineStartedAt = performance.now();

  if (!isSupabaseConfigured()) {
    return new Response(encodeSseEvent('error', { error: 'Supabase is not configured.' }), {
      status: 503,
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    });
  }

  try {
    await requirePlatformAccessFromRequest(request);
  } catch (error) {
    if (error instanceof PlatformAccessError) {
      return new Response(encodeSseEvent('error', { error: error.message }), {
        status: error.status,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      });
    }
    throw error;
  }

  let ecosystemActivityPromise: ReturnType<typeof fetchUserEcosystemActivity> = Promise.resolve(null);
  let memoryContext: MemoryContext | undefined;
  let astraKey: string;
  let delegationPromise: Promise<DelegationPromptContext | undefined> = Promise.resolve(undefined);

  try {
    const identity = await requireAstraIdentity(request, { ensureWorkspace: false });
    astraKey = identity.astraKey;
    const workspace = await ensureAstraWorkspace(identity.astraKey, identity.userId);
    memoryContext = {
      workspaceId: workspace.id,
      astraKey: identity.astraKey,
      memoryUserId: getMem0MemoryUserId(identity),
      userId: identity.userId,
    };

    if (isBackgroundJobsEnabled()) {
      const origin = resolveJobOrigin(request.url);
      delegationPromise = listBackgroundJobs(identity.astraKey, 8)
        .then((jobs) => ({
          toolContext: {
            astraKey: identity.astraKey,
            workspaceId: workspace.id,
            userId: identity.userId,
            origin,
          },
          jobSummaries: summarizeJobsForPrompt(jobs),
        }))
        .catch(() => ({
          toolContext: {
            astraKey: identity.astraKey,
            workspaceId: workspace.id,
            userId: identity.userId,
            origin,
          },
          jobSummaries: [],
        }));
    }

    ecosystemActivityPromise = fetchUserEcosystemActivity(identity.userId);
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

  try {
    const formData = await request.formData();
    const audio = formData.get('audio');
    const mimeType = String(formData.get('mimeType') ?? '');
    const audioDurationMs = Number(formData.get('audioDurationMs') ?? 0);
    const requestMode = parseRequestMode(formData.get('mode'));
    const isMonitorTurn = requestMode === 'live_guide_monitor';
    const isBootstrapTurn = requestMode === 'live_guide_bootstrap';
    const isFrameOnlyTurn = isMonitorTurn || isBootstrapTurn;
    const liveGuideOptions: LiveGuideTurnOptions | undefined =
      requestMode === 'default'
        ? undefined
        : {
            active: true,
            ...(isMonitorTurn ? { monitor: true } : {}),
            ...(isBootstrapTurn
              ? {
                  bootstrap: true,
                  transcriptOverride: LIVE_GUIDE_BOOTSTRAP_TRANSCRIPT,
                }
              : {}),
            ...(parseLiveGuideContext(formData.get('liveGuideContext'))
              ? { context: parseLiveGuideContext(formData.get('liveGuideContext')) }
              : {}),
          };

    if (!(audio instanceof File) && !isFrameOnlyTurn) {
      return new Response(encodeSseEvent('error', { message: 'Missing audio file.' }), {
        status: 400,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      });
    }

    if (audio instanceof File && audio.size === 0 && !isFrameOnlyTurn) {
      return new Response(encodeSseEvent('error', { message: 'Audio file is empty.' }), {
        status: 400,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      });
    }

    if (audio instanceof File && audio.size > MAX_AUDIO_BYTES) {
      return new Response(encodeSseEvent('error', { message: 'Audio file exceeds the 20 MB limit.' }), {
        status: 413,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      });
    }

    const images = await parseImageInputs(formData);

    if (isFrameOnlyTurn && images.length === 0) {
      return new Response(encodeSseEvent('error', { message: 'Live Guide frame turns require a camera image.' }), {
        status: 400,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      });
    }

    const referenceDocuments = await parseReferenceDocumentInputs(formData);
    const audioBytes =
      audio instanceof File && audio.size > 0 ? Buffer.from(await audio.arrayBuffer()) : Buffer.alloc(0);
    const resolvedAudioMimeType = mimeType || (audio instanceof File ? audio.type : 'audio/wav');
    const durationMs = Number.isFinite(audioDurationMs) ? audioDurationMs : 0;
    const userContext = parseUserContextFromFormData(formData);
    const companionProfile = parseCompanionProfileFromFormData(formData);
    const ecosystemActivity = await ecosystemActivityPromise;
    const delegation = await delegationPromise;

    if (shouldDebugResponseStream()) {
      console.debug('[respond-stream] request', {
        audioBytes: audioBytes.length,
        mimeType: resolvedAudioMimeType,
        imageCount: images.length,
        images: images.map((image, index) => ({
          imageId: image.imageId ?? `capture-${index + 1}`,
          mimeType: image.mimeType,
          width: image.width ?? null,
          height: image.height ?? null,
          captureMode: image.captureMode ?? null,
          focusAnnotations: image.focusAnnotations?.length ?? 0,
        })),
        referenceDocumentCount: referenceDocuments.length,
      });
    }

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        try {
          const client = new GoogleGenAI({ apiKey: getGeminiApiKey() });

          const {
            payload,
            ttsPrompt,
            transcript,
            understandingMs,
            sttMs,
            llmMs,
            grounding,
            artifactLanguage,
          } =
            await buildVoiceResponseFromMultimodal(
            client,
            audioBytes,
            resolvedAudioMimeType,
            images.length > 0 ? images : undefined,
            userContext,
            durationMs,
            referenceDocuments,
            companionProfile,
            ecosystemActivity,
            memoryContext,
            delegation,
            liveGuideOptions,
          );

          const monitorStaysSilent =
            isMonitorTurn &&
            (payload.live_guide?.interjection?.should_speak === false ||
              !payload.spoken_transcript.trim());
          const shouldSpeak = Boolean(ttsPrompt) && !monitorStaysSilent;

          if (shouldDebugResponseStream()) {
            console.debug('[respond-stream] tts_start', {
              spokenChars: payload.spoken_transcript.length,
              shouldSpeak,
            });
          }

          const ttsTask = shouldSpeak
            ? speakOnceResilient(ttsPrompt!, { client })
                .then((result) => ({ ok: true as const, ...result }))
                .catch((error) => ({
                  ok: false as const,
                  message: error instanceof Error ? error.message : 'Voice playback failed.',
                }))
            : Promise.resolve(null);

          if (grounding.usedSearch) {
            controller.enqueue(encoder.encode(encodeSseEvent('search_start', {})));
          }

          if (grounding.usedMaps) {
            controller.enqueue(encoder.encode(encodeSseEvent('maps_start', {})));
          }

          if (grounding.usedUrlContext) {
            controller.enqueue(encoder.encode(encodeSseEvent('url_start', {})));
          }

          if (grounding.usedCustomTools) {
            controller.enqueue(encoder.encode(encodeSseEvent('custom_tool_start', {})));
          }

          if (grounding.usedCodeExecution) {
            controller.enqueue(encoder.encode(encodeSseEvent('code_start', {})));
          }

          const places = grounding.places;
          const charts = payload.charts;
          const physicalTask = payload.physical_task ?? null;
          const visualGuidance =
            payload.visual_guidance ?? buildVisualGuidanceFromPhysicalTask(physicalTask, images);
          const liveGuide = payload.live_guide ?? null;
          const guidanceMode = payload.guidance_mode;

          if (liveGuide || guidanceMode !== 'static') {
            if (shouldDebugResponseStream()) {
              console.debug('[respond-stream] live_guide', {
                guidanceMode,
                directiveCount: liveGuide?.directives.length ?? 0,
                monitor: isMonitorTurn,
              });
            }
            controller.enqueue(
              encoder.encode(
                encodeSseEvent('live_guide', {
                  liveGuide,
                  guidanceMode,
                  monitor: isMonitorTurn,
                }),
              ),
            );
          }
          const codeImages = grounding.codeImages;
          const webCitations = grounding.webCitations;
          const customToolCalls = grounding.customToolCalls;
          const rawExplanationText =
            payload.needs_visual_explanation && payload.explanation_text ? payload.explanation_text : '';
          const explanationText =
            places.length > 0
              ? stripGoogleMapsSourcesFromExplanation(rawExplanationText)
              : rawExplanationText;
          const visualImageGroups = filterRelevantVisualImageGroupRequests(payload.visual_image_groups, {
            transcript,
            explanationText,
          });
          const stockImages =
            payload.needs_visual_explanation && visualImageGroups.length > 0
              ? await buildPexelsStockImageGroups(visualImageGroups)
              : [];
          const showExplanation =
            payload.needs_visual_explanation &&
            (explanationText.length > 0 ||
              places.length > 0 ||
              charts.length > 0 ||
              physicalTask !== null ||
              visualGuidance !== null ||
              codeImages.length > 0 ||
              stockImages.length > 0 ||
              webCitations.length > 0);

          if (shouldDebugResponseStream()) {
            console.debug('[respond-stream] response', {
              transcript,
              needsVisualExplanation: payload.needs_visual_explanation,
              explanationChars: explanationText.length,
              physicalTask: Boolean(physicalTask),
              ...countVisualGuidance(visualGuidance),
              charts: charts.length,
              places: places.length,
              codeImages: codeImages.length,
              stockImages: stockImages.length,
              webCitations: webCitations.length,
              customToolCalls,
              showExplanation,
              grounding: {
                usedSearch: grounding.usedSearch,
                usedMaps: grounding.usedMaps,
                usedUrlContext: grounding.usedUrlContext,
                usedCodeExecution: grounding.usedCodeExecution,
                usedCustomTools: grounding.usedCustomTools,
              },
            });
          }

          if (showExplanation) {
            controller.enqueue(
              encoder.encode(
                encodeSseEvent('explanation_start', {
                  needs_visual: true,
                  places,
                  charts,
                  physicalTask,
                  visualGuidance,
                  codeImages,
                  stockImages,
                  webCitations,
                  customToolCalls,
                  artifactLanguage,
                }),
              ),
            );

            if (explanationText) {
              for (const chunk of chunkExplanationText(explanationText)) {
                controller.enqueue(encoder.encode(encodeSseEvent('explanation_delta', { text: chunk })));
              }
            }

            controller.enqueue(
              encoder.encode(
                encodeSseEvent('explanation_done', {
                  text: explanationText,
                  places,
                  charts,
                  physicalTask,
                  visualGuidance,
                  codeImages,
                  stockImages,
                  webCitations,
                  customToolCalls,
                  artifactLanguage,
                }),
              ),
            );
          }

          if (grounding.usedSearch) {
            controller.enqueue(
              encoder.encode(
                encodeSseEvent('search_done', {
                  citation_count: grounding.webCitations.length,
                }),
              ),
            );
          }

          if (grounding.usedMaps) {
            controller.enqueue(
              encoder.encode(
                encodeSseEvent('maps_done', {
                  place_count: places.length,
                }),
              ),
            );
          }

          if (grounding.usedUrlContext) {
            controller.enqueue(
              encoder.encode(
                encodeSseEvent('url_done', {
                  citation_count: grounding.webCitations.length,
                  retrieved_url_count: grounding.retrievedUrlCount,
                }),
              ),
            );
          }

          if (grounding.usedCustomTools) {
            controller.enqueue(
              encoder.encode(
                encodeSseEvent('custom_tool_done', {
                  tools: grounding.customToolCalls,
                }),
              ),
            );
          }

          if (grounding.usedCodeExecution) {
            controller.enqueue(
              encoder.encode(
                encodeSseEvent('code_done', {
                  chart_count: charts.length,
                  image_count: codeImages.length,
                }),
              ),
            );
          }

          const ttsResult = await ttsTask;
          let ttsMs = 0;
          let ttsFirstAudioMs: number | null = null;

          if (ttsResult === null) {
            // Silent turn (e.g. Live Guide monitoring with no interjection) — no audio.
          } else if (ttsResult.ok) {
            ttsMs = ttsResult.ttsMs;
            ttsFirstAudioMs = ttsResult.ttsMs;
            controller.enqueue(
              encoder.encode(
                encodeSseEvent('audio', {
                  data: ttsResult.pcmBase64,
                  ...(ttsResult.mime_type ? { mime_type: ttsResult.mime_type } : {}),
                  sample_rate: ttsResult.sample_rate,
                }),
              ),
            );
            if (shouldDebugResponseStream()) {
              console.debug('[respond-stream] tts_done', {
                ttsMs,
                ttsFirstAudioMs,
                chunkCount: 1,
              });
            }
          } else {
            controller.enqueue(
              encoder.encode(encodeSseEvent('tts_error', { message: ttsResult.message })),
            );
            if (shouldDebugResponseStream()) {
              console.warn('[respond-stream] tts_error', { message: ttsResult.message });
            }
          }

          if (memoryContext && astraKey && !isMonitorTurn) {
            const assistantContextText = buildAssistantContextText(payload);
            void Promise.allSettled([
              insertConversationTurn({
                workspaceId: memoryContext.workspaceId,
                userId: memoryContext.userId,
                astraKey,
                transcript,
                spoken: assistantContextText,
                hasImages: images.length > 0,
                metadata: {
                  needs_visual_explanation: payload.needs_visual_explanation,
                },
              }),
              persistTurnToMem0(memoryContext.memoryUserId, transcript, assistantContextText),
            ]);
          }

          void trackAgentUsage({
            inputTokens: Math.ceil(transcript.length / 4),
            outputTokens: Math.ceil((payload.spoken_transcript ?? '').length / 4),
          }).catch((usageError) => {
            console.error('[respond-stream] trackAgentUsage failed:', usageError);
          });

          const timings: ResponseTimings = {
            audioDurationMs: durationMs,
            sttMs,
            llmMs,
            understandingMs,
            ttsFirstAudioMs,
            ttsMs,
            totalMs: performance.now() - pipelineStartedAt,
          };

          controller.enqueue(
            encoder.encode(
              encodeSseEvent('done', {
                timings,
                spoken_transcript: payload.spoken_transcript,
              }),
            ),
          );
          if (shouldDebugResponseStream()) {
            console.debug('[respond-stream] done', timings);
          }
        } catch (error) {
          const rawMessage = error instanceof Error ? error.message : 'Response pipeline failed.';
          if (shouldDebugResponseStream()) {
            console.error('[respond-stream] error', { message: rawMessage });
          }
          const message = formatUserFacingGeminiError(rawMessage);
          controller.enqueue(encoder.encode(encodeSseEvent('error', { message })));
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
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : 'Response pipeline failed.';
    const message = formatUserFacingGeminiError(rawMessage);
    return new Response(encodeSseEvent('error', { message }), {
      status: 500,
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    });
  }
}
