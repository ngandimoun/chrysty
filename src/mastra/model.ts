import { getKimiAgentModelId, getMoonshotApiKey, getMoonshotBaseUrl } from '@/lib/kimi/client';

/** Kimi (Moonshot) served through Mastra's OpenAI-compatible model config. */
export function getKimiAgentModel() {
  return {
    providerId: 'moonshot',
    modelId: getKimiAgentModelId(),
    url: getMoonshotBaseUrl(),
    apiKey: getMoonshotApiKey(),
  };
}
