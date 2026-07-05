import {
  isGeminiCodeExecutionEnabled,
  isGeminiCustomToolsEnabled,
  isGeminiGoogleMapsEnabled,
  isGeminiGoogleSearchEnabled,
  isGeminiUrlContextEnabled,
} from '@/lib/gemini/config';
import { buildCustomToolDeclarations, hasCustomToolsAvailable } from '@/lib/gemini/custom-tools';
import type { UserContext } from '@/lib/gemini/user-context';
import {
  clampSelectionToEnv,
  type VoiceToolSelection,
} from '@/lib/gemini/tool-catalog';

export type { VoiceToolSelection } from '@/lib/gemini/tool-catalog';

export type GeminiBuiltInTool =
  | { type: 'google_search' }
  | { type: 'google_maps'; latitude?: number; longitude?: number }
  | { type: 'url_context' }
  | { type: 'code_execution' };

export type GeminiTool = GeminiBuiltInTool | ReturnType<typeof buildCustomToolDeclarations>[number];

export function buildGeminiTools(userContext?: UserContext): GeminiBuiltInTool[] {
  const tools: GeminiBuiltInTool[] = [];

  if (isGeminiGoogleSearchEnabled()) {
    tools.push({ type: 'google_search' });
  }

  if (isGeminiGoogleMapsEnabled()) {
    const coords = userContext?.coordinates;
    if (coords) {
      tools.push({
        type: 'google_maps',
        latitude: coords.latitude,
        longitude: coords.longitude,
      });
    } else {
      tools.push({ type: 'google_maps' });
    }
  }

  if (isGeminiUrlContextEnabled()) {
    tools.push({ type: 'url_context' });
  }

  if (isGeminiCodeExecutionEnabled()) {
    tools.push({ type: 'code_execution' });
  }

  return tools;
}

export function buildSelectedGeminiTools(
  userContext: UserContext | undefined,
  selection: VoiceToolSelection,
  options?: { includeDelegation?: boolean },
): GeminiTool[] {
  const selected = clampSelectionToEnv(selection);
  const tools: GeminiTool[] = [];

  if (selected.google_search) {
    tools.push({ type: 'google_search' });
  }

  if (selected.google_maps) {
    const coords = userContext?.coordinates;
    if (coords) {
      tools.push({
        type: 'google_maps',
        latitude: coords.latitude,
        longitude: coords.longitude,
      });
    } else {
      tools.push({ type: 'google_maps' });
    }
  }

  if (selected.url_context) {
    tools.push({ type: 'url_context' });
  }

  if (selected.code_execution) {
    tools.push({ type: 'code_execution' });
  }

  if (selected.custom_tools && isGeminiCustomToolsEnabled()) {
    tools.push(
      ...buildCustomToolDeclarations({ includeDelegation: options?.includeDelegation }),
    );
  }

  return tools;
}

export function buildAllGeminiTools(userContext?: UserContext): GeminiTool[] {
  return [...buildGeminiTools(userContext), ...buildCustomToolDeclarations()];
}

export function hasGeminiToolsEnabled(): boolean {
  return (
    isGeminiGoogleSearchEnabled() ||
    isGeminiGoogleMapsEnabled() ||
    isGeminiUrlContextEnabled() ||
    isGeminiCodeExecutionEnabled() ||
    (isGeminiCustomToolsEnabled() && hasCustomToolsAvailable())
  );
}

function isCustomFunctionTool(tool: GeminiTool): boolean {
  return 'name' in tool && 'parameters' in tool;
}

/** Custom function tools need store=true so previous_interaction_id works for the client-side tool loop. */
export function toolsRequireStoredInteraction(tools: GeminiTool[]): boolean {
  return tools.some(isCustomFunctionTool);
}

/** Remove custom function declarations; used for stateless fallback after local tool execution. */
export function stripCustomFunctionTools(tools: GeminiTool[]): GeminiTool[] {
  return tools.filter((tool) => !isCustomFunctionTool(tool));
}
