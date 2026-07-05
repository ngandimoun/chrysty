import { getAstraRecentTurnsLimit } from '@/lib/mem0/config';
import { createUntypedAdminClient } from '@/lib/supabase/admin';
import type { AstraConversationTurnRow } from '@/lib/supabase/astra-schema.types';

export interface ConversationTurn {
  id: string;
  userTranscript: string;
  assistantSpoken: string | null;
  createdAt: string;
}

export interface FetchRecentTurnsInput {
  workspaceId: string;
  astraKey?: string;
  limit?: number;
}

function rowToTurn(row: AstraConversationTurnRow): ConversationTurn {
  return {
    id: row.id,
    userTranscript: row.user_transcript,
    assistantSpoken: row.assistant_spoken,
    createdAt: row.created_at,
  };
}

export async function fetchRecentTurns(input: FetchRecentTurnsInput): Promise<ConversationTurn[]> {
  const workspaceId = input.workspaceId.trim();
  const astraKey = input.astraKey?.trim();
  const limit = input.limit ?? getAstraRecentTurnsLimit();

  if (!workspaceId && !astraKey) {
    return [];
  }

  try {
    let query = createUntypedAdminClient()
      .from('astra_conversation_turns')
      .select('id, user_transcript, assistant_spoken, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (workspaceId) {
      query = query.eq('workspace_id', workspaceId);
    } else if (astraKey) {
      query = query.eq('astra_key', astraKey);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[conversation-history] fetch failed', error.message);
      return [];
    }

    const rows = (data ?? []) as AstraConversationTurnRow[];
    return rows.map(rowToTurn).reverse();
  } catch (error) {
    console.error('[conversation-history] fetch failed', error);
    return [];
  }
}

export interface InsertConversationTurnInput {
  workspaceId: string;
  userId?: string;
  astraKey: string;
  transcript: string;
  spoken: string;
  hasImages?: boolean;
  metadata?: Record<string, unknown>;
}

export async function insertConversationTurn(input: InsertConversationTurnInput): Promise<void> {
  const transcript = input.transcript.trim();
  const workspaceId = input.workspaceId.trim();
  const astraKey = input.astraKey.trim();

  if (!transcript || !workspaceId || !astraKey) {
    return;
  }

  try {
    const { error } = await createUntypedAdminClient().from('astra_conversation_turns').insert({
      workspace_id: workspaceId,
      user_id: input.userId?.trim() || null,
      astra_key: astraKey,
      user_transcript: transcript,
      assistant_spoken: input.spoken.trim() || null,
      has_images: input.hasImages ?? false,
      metadata: input.metadata ?? {},
    });

    if (error) {
      console.error('[conversation-history] insert failed', error.message);
    }
  } catch (error) {
    console.error('[conversation-history] insert failed', error);
  }
}
