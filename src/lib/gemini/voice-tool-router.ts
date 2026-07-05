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
    reasoning: { type: 'string' },
  },
  required: [
    'google_search',
    'google_maps',
    'url_context',
    'code_execution',
    'custom_tools',
  ],
} as const;

export interface VoiceToolRouteResult {
  selection: VoiceToolSelection;
  rawSelection: VoiceToolSelection;
  reasoning: string | null;
  routeMs: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function parseBooleanField(record: Record<string, unknown>, key: keyof VoiceToolSelection): boolean {
  return record[key] === true;
}

function parseRouterResponse(raw: string): { selection: VoiceToolSelection; reasoning: string | null } {
  const parsed = JSON.parse(raw) as unknown;
  const record = asRecord(parsed);
  if (!record) {
    return { selection: EMPTY_TOOL_SELECTION, reasoning: null };
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

function isLikelyCameraPhysicalTask(transcript: string): boolean {
  return /\b(clean|cook|make|build|fix|repair|connect|assemble|use|move|place|cut|wash|mix|ingredient|dish|dishes|part|tool|product|bottle|skin|pool|shot|aim|broken|damage|material)\b/i.test(
    transcript,
  );
}

function explicitlyNeedsExternalInfo(transcript: string): boolean {
  return /\b(search|google|web|online|latest|current|today|price|nearby|near me|open now|buy|where can i|official|manual|recipe from|authentic recipe|news)\b/i.test(
    transcript,
  );
}

function suppressExternalToolsForCameraTask(
  selection: VoiceToolSelection,
  transcript: string,
  hasImages: boolean,
): VoiceToolSelection {
  if (!hasImages || !isLikelyCameraPhysicalTask(transcript) || explicitlyNeedsExternalInfo(transcript)) {
    return selection;
  }

  return {
    ...selection,
    google_search: false,
    google_maps: false,
    url_context: false,
  };
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
      reasoning: null,
      routeMs: 0,
    };
  }

  if (listAvailableToolIds().length === 0) {
    return {
      selection: EMPTY_TOOL_SELECTION,
      rawSelection: EMPTY_TOOL_SELECTION,
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
        reasoning: null,
        routeMs: performance.now() - routeStartedAt,
      };
    }

    const { selection: rawSelection, reasoning } = parseRouterResponse(raw);
    const selection = suppressExternalToolsForCameraTask(resolveToolSelection(rawSelection, {
      transcript,
      hasImages: context.hasImages,
    }), transcript, context.hasImages);

    if (shouldDebugTools()) {
      console.debug('[tool-router]', {
        transcript,
        rawSelection,
        resolvedSelection: selection,
        reasoning,
        model: routedModel,
      });
    }

    return {
      selection,
      rawSelection,
      reasoning,
      routeMs: performance.now() - routeStartedAt,
    };
  } catch {
    return {
      selection: EMPTY_TOOL_SELECTION,
      rawSelection: EMPTY_TOOL_SELECTION,
      reasoning: null,
      routeMs: performance.now() - routeStartedAt,
    };
  }
}
