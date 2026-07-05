import { getMem0Client } from '@/lib/mem0/client';
import {
  getMem0AgentId,
  getMem0SearchThreshold,
  getMem0SearchTopK,
  isMem0Enabled,
} from '@/lib/mem0/config';
import { shouldUseMem0ForTranscript } from '@/lib/mem0/policy';
import type { RetrievedMemory } from '@/lib/mem0/types';

function normalizeSearchResults(results: unknown): RetrievedMemory[] {
  if (!Array.isArray(results)) {
    return [];
  }

  const memories: RetrievedMemory[] = [];

  for (const item of results) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const record = item as Record<string, unknown>;
    const id = typeof record.id === 'string' ? record.id : '';
    const memory =
      typeof record.memory === 'string'
        ? record.memory
        : typeof (record.data as { memory?: string } | undefined)?.memory === 'string'
          ? (record.data as { memory: string }).memory
          : '';

    if (!id || !memory.trim()) {
      continue;
    }

    memories.push({
      id,
      memory: memory.trim(),
      score: typeof record.score === 'number' ? record.score : undefined,
      categories: Array.isArray(record.categories)
        ? record.categories.filter((entry): entry is string => typeof entry === 'string')
        : undefined,
    });
  }

  return memories;
}

export async function searchUserMemories(
  userId: string,
  query: string,
): Promise<RetrievedMemory[]> {
  if (!isMem0Enabled() || !userId.trim() || !query.trim() || !shouldUseMem0ForTranscript(query)) {
    return [];
  }

  const client = getMem0Client();
  if (!client) {
    return [];
  }

  try {
    const response = await client.search(query, {
      filters: { user_id: userId, agent_id: getMem0AgentId() },
      topK: getMem0SearchTopK(),
      threshold: getMem0SearchThreshold(),
    });

    return normalizeSearchResults(response?.results);
  } catch (error) {
    console.error('[mem0] search failed', error);
    return [];
  }
}
