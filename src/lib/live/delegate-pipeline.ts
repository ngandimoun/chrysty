import type { GoogleGenAI } from '@google/genai';

import type { CompanionProfile } from '@/lib/gemini/companion-profile';
import { buildPexelsStockImageGroups } from '@/lib/pexels/photos';
import type { DelegationPromptContext } from '@/lib/gemini/response-prompt';
import {
  buildVoiceResponseFromMultimodal,
  type LiveGuideTurnOptions,
  type MultimodalImageInput,
} from '@/lib/gemini/response-prompt';
import { stripGoogleMapsSourcesFromExplanation } from '@/lib/gemini/tool-grounding';
import type { UserContext } from '@/lib/gemini/user-context';
import { chunkExplanationText } from '@/lib/gemini/voice-response-schema';
import { filterRelevantVisualImageGroupRequests } from '@/lib/visuals/stock-images';
import type { MemoryContext } from '@/lib/mem0/types';
import type { UserEcosystemActivity } from '@/lib/astra/ecosystem-activity';
import { encodeSseEvent } from '@/lib/live/sse';
import type {
  LiveDelegationResult,
  LiveDelegationStage,
} from '@/lib/live/types';

export interface LiveDelegateStreamContext {
  turn_id: string;
  transcript: string;
  images?: MultimodalImageInput[];
  userContext?: UserContext;
  companionProfile?: CompanionProfile;
  memoryContext?: MemoryContext;
  delegation?: DelegationPromptContext;
  ecosystemActivity?: UserEcosystemActivity | null;
  liveGuide?: LiveGuideTurnOptions;
  explicitArtifactLanguage?: string | null;
  requestLanguage?: string | null;
  onStage?: (stage: LiveDelegationStage) => void | Promise<void>;
}

function buildVisualGuidanceFromPhysicalTask(
  physicalTask: NonNullable<Awaited<ReturnType<typeof buildVoiceResponseFromMultimodal>>['payload']['physical_task']>,
  images: Array<{ imageId?: string }>,
) {
  if (!physicalTask) return null;
  const defaultImageId = images[0]?.imageId || 'capture-1';
  const sceneItems = physicalTask.visual_annotations
    .filter((annotation) => annotation.x !== undefined && annotation.y !== undefined)
    .slice(0, 8)
    .map((annotation, index) => ({
      item_id: `physical-item-${index + 1}`,
      display_number: annotation.display_number ?? index + 1,
      name: annotation.label,
      image_id: annotation.image_id ?? defaultImageId,
      point: { x: annotation.x ?? 0.5, y: annotation.y ?? 0.5 },
    }));

  return {
    scene_items: sceneItems,
    overlays: [],
    cards: [],
    differences: [],
  };
}

export async function streamLiveDelegationToEncoder(
  client: GoogleGenAI,
  encoder: TextEncoder,
  enqueue: (chunk: Uint8Array) => void,
  context: LiveDelegateStreamContext,
): Promise<{ spoken_summary: string; transcript: string; result: LiveDelegationResult }> {
  const pipelineStartedAt = performance.now();
  const emitStage = async (stage: LiveDelegationStage) => {
    enqueue(encoder.encode(encodeSseEvent('delegation_progress', { turn_id: context.turn_id, stage })));
    await context.onStage?.(stage);
  };

  await emitStage('analyzing');

  const { payload, transcript, grounding, artifactLanguage } = await buildVoiceResponseFromMultimodal(
    client,
    Buffer.alloc(0),
    'audio/wav',
    context.images,
    context.userContext,
    0,
    [],
    context.companionProfile,
    context.ecosystemActivity ?? null,
    context.memoryContext,
    context.delegation,
    context.liveGuide,
    {
      transcriptOverride: context.transcript,
      skipStt: true,
      onProgress: emitStage,
      explicitArtifactLanguage: context.explicitArtifactLanguage,
      requestLanguage: context.requestLanguage,
    },
  );

  const places = grounding.places;
  const charts = payload.charts;
  const physicalTask = payload.physical_task ?? null;
  const visualGuidance =
    payload.visual_guidance ??
    (physicalTask ? buildVisualGuidanceFromPhysicalTask(physicalTask, context.images ?? []) : null);
  const liveGuide = payload.live_guide ?? null;
  const guidanceMode = payload.guidance_mode;
  const codeImages = grounding.codeImages;
  const webCitations = grounding.webCitations;
  const customToolCalls = grounding.customToolCalls;

  const rawExplanationText =
    payload.needs_visual_explanation && payload.explanation_text ? payload.explanation_text : '';
  const explanationText =
    places.length > 0 ? stripGoogleMapsSourcesFromExplanation(rawExplanationText) : rawExplanationText;

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

  if (liveGuide || guidanceMode !== 'static') {
    enqueue(
      encoder.encode(
        encodeSseEvent('live_guide', {
          turn_id: context.turn_id,
          liveGuide,
          guidanceMode,
          monitor: false,
        }),
      ),
    );
  }

  if (grounding.usedSearch) {
    enqueue(encoder.encode(encodeSseEvent('search_start', { turn_id: context.turn_id })));
  }
  if (grounding.usedMaps) {
    enqueue(encoder.encode(encodeSseEvent('maps_start', { turn_id: context.turn_id })));
  }
  if (grounding.usedUrlContext) {
    enqueue(encoder.encode(encodeSseEvent('url_start', { turn_id: context.turn_id })));
  }
  if (grounding.usedCustomTools) {
    enqueue(encoder.encode(encodeSseEvent('custom_tool_start', { turn_id: context.turn_id })));
  }
  if (grounding.usedCodeExecution) {
    enqueue(encoder.encode(encodeSseEvent('code_start', { turn_id: context.turn_id })));
  }

  if (showExplanation) {
    await emitStage('preparing_visuals');
    enqueue(
      encoder.encode(
        encodeSseEvent('explanation_start', {
          turn_id: context.turn_id,
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

    for (const chunk of chunkExplanationText(explanationText)) {
      enqueue(
        encoder.encode(encodeSseEvent('explanation_delta', { turn_id: context.turn_id, text: chunk })),
      );
    }

    enqueue(
      encoder.encode(
        encodeSseEvent('explanation_done', {
          turn_id: context.turn_id,
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
    enqueue(
      encoder.encode(
        encodeSseEvent('search_done', { turn_id: context.turn_id, citation_count: webCitations.length }),
      ),
    );
  }
  if (grounding.usedMaps) {
    enqueue(
      encoder.encode(encodeSseEvent('maps_done', { turn_id: context.turn_id, place_count: places.length })),
    );
  }
  if (grounding.usedUrlContext) {
    enqueue(encoder.encode(encodeSseEvent('url_done', { turn_id: context.turn_id })));
  }
  if (grounding.usedCustomTools) {
    enqueue(
      encoder.encode(
        encodeSseEvent('custom_tool_done', { turn_id: context.turn_id, tools: customToolCalls }),
      ),
    );
  }
  if (grounding.usedCodeExecution) {
    enqueue(encoder.encode(encodeSseEvent('code_done', { turn_id: context.turn_id })));
  }

  const spokenSummary = payload.spoken_transcript.trim();
  const timings = {
    sttMs: 0,
    llmMs: 0,
    ttsMs: 0,
    ttsFirstAudioMs: null,
    totalMs: performance.now() - pipelineStartedAt,
    audioDurationMs: 0,
  };
  const result: LiveDelegationResult = {
    explanation_text: explanationText,
    show_explanation: showExplanation,
    visuals: {
      places,
      charts,
      physicalTask,
      visualGuidance,
      codeImages,
      stockImages,
      webCitations,
      customToolCalls,
    },
    spoken_summary: spokenSummary,
    timings,
    live_guide: liveGuide,
    guidance_mode: guidanceMode,
    artifact_language: artifactLanguage,
  };

  enqueue(
    encoder.encode(
      encodeSseEvent('done', {
        turn_id: context.turn_id,
        spoken_transcript: spokenSummary,
        timings,
      }),
    ),
  );

  await context.onStage?.('completed');
  return { spoken_summary: spokenSummary, transcript, result };
}
