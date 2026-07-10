import type { ResponseTimings } from '@/lib/gemini/config';
import type { StreamingAudioChunk } from '@/lib/audio/streaming-player';
import type { ChartSpec, CodeExecutionImage } from '@/lib/charts/types';
import { parseGuidanceMode, parseLiveGuide, parseVisualGuidance } from '@/lib/gemini/voice-response-schema';
import type {
  PhysicalEvidenceItem,
  PhysicalNextAction,
  PhysicalSafetyNote,
  PhysicalTaskResponse,
  PhysicalTaskState,
  PhysicalVisualAnnotation,
} from '@/lib/gemini/voice-response-schema';
import type { ExplanationVisuals, LiveGuideUpdate, PlaceCard, WebCitation } from '@/lib/streaming/types';
import { parseStockImageGroups } from '@/lib/visuals/stock-images';
import type { LiveDelegationStage } from '@/lib/live/types';

export interface ResponseStreamDone {
  timings: ResponseTimings;
  spokenTranscript?: string;
}

export interface ResponseStreamCallbacks {
  onAudio: (chunk: StreamingAudioChunk) => void | Promise<void>;
  onExplanationStart?: (visuals: ExplanationVisuals) => void;
  onExplanationDelta?: (text: string) => void;
  onExplanationDone?: (text: string, visuals: ExplanationVisuals) => void;
  onLiveGuide?: (update: LiveGuideUpdate) => void;
  onTtsError?: (message: string) => void;
  onProgress?: (stage: LiveDelegationStage, payload: Record<string, unknown>) => void;
}

function parsePlaces(value: unknown): PlaceCard[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const record = item as Record<string, unknown>;
      const name = typeof record.name === 'string' ? record.name.trim() : '';
      const url = typeof record.url === 'string' ? record.url.trim() : '';
      if (!name && !url) {
        return null;
      }

      return {
        name: name || url,
        url,
        ...(typeof record.placeId === 'string' ? { placeId: record.placeId } : {}),
        ...(typeof record.reviewSnippet === 'string' ? { reviewSnippet: record.reviewSnippet } : {}),
      } satisfies PlaceCard;
    })
    .filter((place): place is PlaceCard => place !== null);
}

function parseCharts(value: unknown): ChartSpec[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value as ChartSpec[];
}

function parseCodeImages(value: unknown): CodeExecutionImage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const record = item as Record<string, unknown>;
      const data = typeof record.data === 'string' ? record.data.trim() : '';
      if (!data) {
        return null;
      }

      const mimeType =
        typeof record.mimeType === 'string' && record.mimeType.trim()
          ? record.mimeType.trim()
          : 'image/png';

      return {
        mimeType,
        data,
        ...(typeof record.caption === 'string' && record.caption.trim()
          ? { caption: record.caption.trim() }
          : {}),
      } satisfies CodeExecutionImage;
    })
    .filter((image): image is CodeExecutionImage => image !== null);
}

function parseWebCitations(value: unknown): WebCitation[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const record = item as Record<string, unknown>;
      const url = typeof record.url === 'string' ? record.url.trim() : '';
      const title = typeof record.title === 'string' ? record.title.trim() : '';
      if (!url) {
        return null;
      }

      return {
        url,
        title: title || url,
      } satisfies WebCitation;
    })
    .filter((citation): citation is WebCitation => citation !== null);
}

function parseCustomToolCalls(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function parsePhysicalTaskState(value: unknown): PhysicalTaskState | undefined {
  const record = asRecord(value);
  if (!record) return undefined;

  const task = cleanString(record.task);
  const stage = cleanString(record.stage);
  const progress = cleanString(record.progress);
  const confidence = cleanString(record.confidence);

  if (!task && !stage && !progress && !confidence) return undefined;
  return {
    ...(task ? { task } : {}),
    ...(stage ? { stage } : {}),
    ...(progress ? { progress } : {}),
    ...(confidence ? { confidence } : {}),
  };
}

function parsePhysicalEvidence(value: unknown): PhysicalEvidenceItem[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      const record = asRecord(item);
      if (!record) return null;
      const text = cleanString(record.text);
      if (!text) return null;
      const source = cleanString(record.source);
      const confidence = cleanString(record.confidence);
      return {
        text,
        ...(source ? { source } : {}),
        ...(confidence ? { confidence } : {}),
      } satisfies PhysicalEvidenceItem;
    })
    .filter((item): item is PhysicalEvidenceItem => item !== null);
}

function parsePhysicalNextActions(value: unknown): PhysicalNextAction[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      const record = asRecord(item);
      if (!record) return null;
      const title = cleanString(record.title);
      if (!title) return null;
      const detail = cleanString(record.detail);
      const why = cleanString(record.why);
      const check = cleanString(record.check);
      const example = cleanString(record.example);
      return {
        title,
        ...(detail ? { detail } : {}),
        ...(why ? { why } : {}),
        ...(check ? { check } : {}),
        ...(example ? { example } : {}),
      } satisfies PhysicalNextAction;
    })
    .filter((item): item is PhysicalNextAction => item !== null);
}

function parsePhysicalSafetyNotes(value: unknown): PhysicalSafetyNote[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      const record = asRecord(item);
      if (!record) return null;
      const message = cleanString(record.message);
      if (!message) return null;
      const severity = cleanString(record.severity);
      const stopCondition = cleanString(record.stopCondition);
      return {
        message,
        ...(severity ? { severity } : {}),
        ...(stopCondition ? { stopCondition } : {}),
      } satisfies PhysicalSafetyNote;
    })
    .filter((item): item is PhysicalSafetyNote => item !== null);
}

function parsePhysicalFollowUps(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function parseCoordinate(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : undefined;
}

function parsePhysicalVisualAnnotations(value: unknown): PhysicalVisualAnnotation[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      const record = asRecord(item);
      if (!record) return null;
      const label = cleanString(record.label);
      if (!label) return null;
      const x = parseCoordinate(record.x);
      const y = parseCoordinate(record.y);
      const width = parseCoordinate(record.width);
      const height = parseCoordinate(record.height);
      const confidence = cleanString(record.confidence);
      const imageId = cleanString(record.image_id);
      return {
        label,
        ...(imageId ? { image_id: imageId } : {}),
        ...(x !== undefined ? { x } : {}),
        ...(y !== undefined ? { y } : {}),
        ...(width !== undefined ? { width } : {}),
        ...(height !== undefined ? { height } : {}),
        ...(confidence ? { confidence } : {}),
      } satisfies PhysicalVisualAnnotation;
    })
    .filter((item): item is PhysicalVisualAnnotation => item !== null);
}

function parsePhysicalTask(value: unknown): PhysicalTaskResponse | null {
  const record = asRecord(value);
  if (!record) return null;

  const taskState = parsePhysicalTaskState(record.task_state);
  const observedEvidence = parsePhysicalEvidence(record.observed_evidence);
  const nextActions = parsePhysicalNextActions(record.next_actions);
  const safetyNotes = parsePhysicalSafetyNotes(record.safety_notes);
  const followUpSuggestions = parsePhysicalFollowUps(record.follow_up_suggestions);
  const visualAnnotations = parsePhysicalVisualAnnotations(record.visual_annotations);

  if (
    !taskState &&
    observedEvidence.length === 0 &&
    nextActions.length === 0 &&
    safetyNotes.length === 0 &&
    followUpSuggestions.length === 0 &&
    visualAnnotations.length === 0
  ) {
    return null;
  }

  return {
    ...(taskState ? { task_state: taskState } : {}),
    observed_evidence: observedEvidence,
    next_actions: nextActions,
    safety_notes: safetyNotes,
    follow_up_suggestions: followUpSuggestions,
    visual_annotations: visualAnnotations,
  };
}

function parseVisuals(payload: Record<string, unknown>): ExplanationVisuals {
  return {
    places: parsePlaces(payload.places),
    charts: parseCharts(payload.charts),
    codeImages: parseCodeImages(payload.codeImages),
    stockImages: parseStockImageGroups(payload.stockImages),
    webCitations: parseWebCitations(payload.webCitations),
    customToolCalls: parseCustomToolCalls(payload.customToolCalls),
    physicalTask: parsePhysicalTask(payload.physicalTask),
    visualGuidance: parseVisualGuidance(payload.visualGuidance),
  };
}

function parseSseBlock(block: string): { event: string; data: string } | null {
  const lines = block.split('\n');
  let event = 'message';
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trim());
    }
  }

  if (dataLines.length === 0) {
    return null;
  }

  return { event, data: dataLines.join('\n') };
}

export async function consumeResponseStream(
  response: Response,
  callbacks: ResponseStreamCallbacks,
): Promise<{ done: ResponseStreamDone | null; error: string | null }> {
  const {
    onAudio,
    onExplanationStart,
    onExplanationDelta,
    onExplanationDone,
    onLiveGuide,
    onTtsError,
    onProgress,
  } =
    callbacks;

  if (!response.ok) {
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const payload = (await response.json()) as { error?: string };
      return { done: null, error: payload.error ?? 'Response request failed.' };
    }

    return { done: null, error: 'Response request failed.' };
  }

  const reader = response.body?.getReader();
  if (!reader) {
    return { done: null, error: 'Streaming response body is unavailable.' };
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      const parsed = parseSseBlock(block);
      if (parsed) {
        try {
          const payload = JSON.parse(parsed.data) as Record<string, unknown>;

          if (parsed.event === 'delegation_progress' && typeof payload.stage === 'string') {
            onProgress?.(payload.stage as LiveDelegationStage, payload);
          } else if (
            ['search_start', 'maps_start', 'url_start', 'custom_tool_start', 'code_start'].includes(
              parsed.event,
            )
          ) {
            const stageByEvent: Partial<Record<string, LiveDelegationStage>> = {
              search_start: 'using_search',
              maps_start: 'using_maps',
              url_start: 'reading_source',
              custom_tool_start: 'using_custom_tool',
              code_start: 'running_code',
            };
            const stage = stageByEvent[parsed.event];
            if (stage) onProgress?.(stage, payload);
          } else if (parsed.event === 'explanation_start') {
            onExplanationStart?.(parseVisuals(payload));
          } else if (parsed.event === 'explanation_delta' && typeof payload.text === 'string') {
            onExplanationDelta?.(payload.text);
          } else if (parsed.event === 'explanation_done' && typeof payload.text === 'string') {
            onExplanationDone?.(payload.text, parseVisuals(payload));
          } else if (parsed.event === 'live_guide') {
            onLiveGuide?.({
              liveGuide: parseLiveGuide(payload.liveGuide),
              guidanceMode: parseGuidanceMode(payload.guidanceMode),
              monitor: payload.monitor === true,
            });
          } else if (parsed.event === 'audio' && typeof payload.data === 'string') {
            void onAudio({
              data: payload.data,
              mime_type: typeof payload.mime_type === 'string' ? payload.mime_type : undefined,
              sample_rate: typeof payload.sample_rate === 'number' ? payload.sample_rate : undefined,
            });
          } else if (parsed.event === 'tts_error') {
            onTtsError?.(typeof payload.message === 'string' ? payload.message : 'Voice playback failed.');
          } else if (parsed.event === 'done') {
            const timings =
              (payload.timings as ResponseTimings | undefined) ??
              (payload.cached === true
                ? {
                    sttMs: 0,
                    llmMs: 0,
                    ttsMs: 0,
                    ttsFirstAudioMs: null,
                    totalMs: 0,
                    audioDurationMs: 0,
                  }
                : undefined);
            if (!timings) {
              return { done: null, error: 'Response completed without timings.' };
            }

            return {
              done: {
                timings,
                ...(typeof payload.spoken_transcript === 'string'
                  ? { spokenTranscript: payload.spoken_transcript }
                  : {}),
              },
              error: null,
            };
          } else if (parsed.event === 'error') {
            return {
              done: null,
              error: typeof payload.message === 'string' ? payload.message : 'Response failed.',
            };
          }
        } catch {
          return { done: null, error: 'Failed to parse streaming response.' };
        }
      }

      boundary = buffer.indexOf('\n\n');
    }
  }

  return { done: null, error: 'Streaming response ended before completion.' };
}
