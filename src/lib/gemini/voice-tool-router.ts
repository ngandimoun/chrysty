import type { GoogleGenAI } from '@google/genai';

import { getGeminiRouterModelCandidates, getGeminiRouterTimeoutMs } from '@/lib/gemini/config';
import { runWithGeminiModelFallback } from '@/lib/gemini/model-fallback';
import {
  buildRouterSystemInstruction,
  clampSelectionToEnv,
  EMPTY_TOOL_SELECTION,
  listAvailableToolIds,
  resolveToolSelection,
  type VoiceToolSelection,
} from '@/lib/gemini/tool-catalog';
import type { UserContext } from '@/lib/gemini/user-context';
import { normalizeBcp47 } from '@/lib/language/language-resolution';

export type { VoiceToolSelection } from '@/lib/gemini/tool-catalog';
export {
  clampSelectionToEnv,
  EMPTY_TOOL_SELECTION,
  formatToolSelection,
  hasSelectedToolsEnabled,
  listAvailableToolIds,
} from '@/lib/gemini/tool-catalog';

const TOOL_ROUTER_JSON_SCHEMA = {
  type: 'object',
  properties: {
    google_search: { type: 'boolean' },
    google_maps: { type: 'boolean' },
    url_context: { type: 'boolean' },
    code_execution: { type: 'boolean' },
    custom_tools: { type: 'boolean' },
    task_class: {
      type: 'string',
      enum: ['conversation', 'vision', 'compute', 'web', 'geo', 'structured', 'background'],
    },
    execution_lane: {
      type: 'string',
      enum: ['immediate', 'structured', 'background'],
    },
    response_surface: {
      type: 'string',
      enum: ['voice', 'camera', 'canvas', 'document'],
    },
    requires_chart: { type: 'boolean' },
    request_language: {
      type: 'string',
      description: 'Detected current request language as a BCP-47 code, or empty when uncertain',
    },
    reasoning: { type: 'string' },
  },
  required: [
    'google_search',
    'google_maps',
    'url_context',
    'code_execution',
    'custom_tools',
    'task_class',
    'execution_lane',
    'response_surface',
    'requires_chart',
  ],
} as const;

export type VoiceTaskClass =
  | 'conversation'
  | 'vision'
  | 'compute'
  | 'web'
  | 'geo'
  | 'structured'
  | 'background';
export type VoiceExecutionLane = 'immediate' | 'structured' | 'background';
export type VoiceResponseSurface = 'voice' | 'camera' | 'canvas' | 'document';

export interface VoiceRouteDecision {
  taskClass: VoiceTaskClass;
  executionLane: VoiceExecutionLane;
  responseSurface: VoiceResponseSurface;
  requiresChart: boolean;
  requestLanguage: string | null;
}

const DEFAULT_ROUTE_DECISION: VoiceRouteDecision = {
  taskClass: 'conversation',
  executionLane: 'immediate',
  responseSurface: 'voice',
  requiresChart: false,
  requestLanguage: null,
};

export interface VoiceToolRouteResult {
  selection: VoiceToolSelection;
  rawSelection: VoiceToolSelection;
  decision: VoiceRouteDecision;
  reasoning: string | null;
  routeMs: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function parseBooleanField(record: Record<string, unknown>, key: keyof VoiceToolSelection): boolean {
  return record[key] === true;
}

function parseEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === 'string' && allowed.includes(value as T) ? (value as T) : fallback;
}

function parseRouterResponse(raw: string): {
  selection: VoiceToolSelection;
  decision: VoiceRouteDecision;
  reasoning: string | null;
} {
  const parsed = JSON.parse(raw) as unknown;
  const record = asRecord(parsed);
  if (!record) {
    return { selection: EMPTY_TOOL_SELECTION, decision: DEFAULT_ROUTE_DECISION, reasoning: null };
  }

  const reasoning =
    typeof record.reasoning === 'string' && record.reasoning.trim()
      ? record.reasoning.trim()
      : null;

  return {
    selection: clampSelectionToEnv({
      google_search: parseBooleanField(record, 'google_search'),
      google_maps: parseBooleanField(record, 'google_maps'),
      url_context: parseBooleanField(record, 'url_context'),
      code_execution: parseBooleanField(record, 'code_execution'),
      custom_tools: parseBooleanField(record, 'custom_tools'),
    }),
    decision: {
      taskClass: parseEnum(
        record.task_class,
        ['conversation', 'vision', 'compute', 'web', 'geo', 'structured', 'background'] as const,
        'conversation',
      ),
      executionLane: parseEnum(
        record.execution_lane,
        ['immediate', 'structured', 'background'] as const,
        'immediate',
      ),
      responseSurface: parseEnum(
        record.response_surface,
        ['voice', 'camera', 'canvas', 'document'] as const,
        'voice',
      ),
      requiresChart: record.requires_chart === true,
      requestLanguage: normalizeBcp47(record.request_language),
    },
    reasoning,
  };
}

function buildRouterUserInput(
  transcript: string,
  context: { hasImages: boolean; imageCount: number; userContext?: UserContext },
): string {
  const lines = [
    `Transcript:\n"""${transcript}"""`,
    context.hasImages
      ? `Camera: ${context.imageCount} image(s) attached to the response step.`
      : 'Camera: no images attached.',
  ];

  if (context.userContext) {
    lines.push(`User locale: ${context.userContext.locale}`);
    lines.push(
      `User local time: ${context.userContext.localDateTimeLabel} (${context.userContext.timezone})`,
    );
    if (context.userContext.coordinates) {
      lines.push(
        `User coordinates: ${context.userContext.coordinates.latitude.toFixed(4)}, ${context.userContext.coordinates.longitude.toFixed(4)}`,
      );
    }
  }

  return lines.join('\n\n');
}

function shouldDebugTools(): boolean {
  return (
    process.env.NODE_ENV === 'development' ||
    process.env.NEXT_PUBLIC_DEBUG_TOOLS === 'true'
  );
}

export async function routeVoiceTools(
  client: GoogleGenAI,
  transcript: string,
  context: { hasImages: boolean; imageCount: number; userContext?: UserContext },
): Promise<VoiceToolRouteResult> {
  const routeStartedAt = performance.now();

  if (!transcript.trim()) {
    return {
      selection: EMPTY_TOOL_SELECTION,
      rawSelection: EMPTY_TOOL_SELECTION,
      decision: DEFAULT_ROUTE_DECISION,
      reasoning: null,
      routeMs: 0,
    };
  }

  if (listAvailableToolIds().length === 0) {
    return {
      selection: EMPTY_TOOL_SELECTION,
      rawSelection: EMPTY_TOOL_SELECTION,
      decision: DEFAULT_ROUTE_DECISION,
      reasoning: null,
      routeMs: performance.now() - routeStartedAt,
    };
  }

  try {
    const { model: routedModel, result: interaction } = await runWithGeminiModelFallback(
      getGeminiRouterModelCandidates(),
      (model) =>
        client.interactions.create({
          model,
          store: false,
          system_instruction: buildRouterSystemInstruction(),
          input: buildRouterUserInput(transcript, context),
          response_format: {
            type: 'text',
            mime_type: 'application/json',
            schema: TOOL_ROUTER_JSON_SCHEMA,
          },
        }),
      { timeoutMs: getGeminiRouterTimeoutMs() },
    );

    const raw = interaction.output_text?.trim();
    if (!raw) {
      return {
        selection: EMPTY_TOOL_SELECTION,
        rawSelection: EMPTY_TOOL_SELECTION,
        decision: DEFAULT_ROUTE_DECISION,
        reasoning: null,
        routeMs: performance.now() - routeStartedAt,
      };
    }

    const { selection: rawSelection, decision, reasoning } = parseRouterResponse(raw);
    let selection = resolveToolSelection(rawSelection, {
      transcript,
      hasImages: context.hasImages,
    });
    if (decision.requiresChart) {
      selection = clampSelectionToEnv({
        ...selection,
        code_execution: true,
        custom_tools: false,
      });
    } else if (decision.executionLane === 'background') {
      selection = clampSelectionToEnv({
        google_search: false,
        google_maps: false,
        url_context: false,
        code_execution: false,
        custom_tools: true,
      });
    }

    if (shouldDebugTools()) {
      console.debug('[tool-router]', {
        transcript,
        rawSelection,
        resolvedSelection: selection,
        decision,
        reasoning,
        model: routedModel,
      });
    }

    return {
      selection,
      rawSelection,
      decision,
      reasoning,
      routeMs: performance.now() - routeStartedAt,
    };
  } catch {
    return {
      selection: EMPTY_TOOL_SELECTION,
      rawSelection: EMPTY_TOOL_SELECTION,
      decision: DEFAULT_ROUTE_DECISION,
      reasoning: null,
      routeMs: performance.now() - routeStartedAt,
    };
  }
}
