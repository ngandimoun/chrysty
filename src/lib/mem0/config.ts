export function isMem0Enabled(): boolean {
  return Boolean(process.env.MEM0_API_KEY?.trim());
}

export function getMem0ApiKey(): string {
  const apiKey = process.env.MEM0_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('MEM0_API_KEY is not configured on the server.');
  }
  return apiKey;
}

export function getMem0AgentId(): string {
  return process.env.MEM0_AGENT_ID?.trim() || 'chrysty-astra';
}

export function getMem0SearchTopK(): number {
  const raw = Number(process.env.MEM0_SEARCH_TOP_K);
  return Number.isFinite(raw) && raw > 0 ? raw : 8;
}

export function getMem0SearchThreshold(): number {
  const raw = Number(process.env.MEM0_SEARCH_THRESHOLD);
  return Number.isFinite(raw) && raw >= 0 ? raw : 0.3;
}

export function getAstraRecentTurnsLimit(): number {
  const raw = Number(process.env.ASTRA_RECENT_TURNS_LIMIT);
  return Number.isFinite(raw) && raw > 0 ? raw : 6;
}
