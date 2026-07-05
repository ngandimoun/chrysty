export function getMoonshotBaseUrl(): string {
  return process.env.MOONSHOT_BASE_URL?.trim() || 'https://api.moonshot.ai/v1';
}

export function getMoonshotApiKey(): string {
  const apiKey = process.env.MOONSHOT_API_KEY?.trim();
  if (!apiKey) throw new Error('MOONSHOT_API_KEY is not set');
  return apiKey;
}

export function isKimiConfigured(): boolean {
  return Boolean(process.env.MOONSHOT_API_KEY?.trim());
}

/** Model used by background manager/specialist agents. */
export function getKimiAgentModelId(): string {
  return process.env.KIMI_AGENT_MODEL?.trim() || 'kimi-k2.6';
}
