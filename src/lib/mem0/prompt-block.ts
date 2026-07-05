import type { ConversationTurn } from '@/lib/astra/db/conversation-history';
import { prepareMemoriesForPrompt } from '@/lib/mem0/policy';
import type { RetrievedMemory } from '@/lib/mem0/types';

export function buildMemoriesBlock(memories: RetrievedMemory[]): string | null {
  const preparedMemories = prepareMemoriesForPrompt(memories);
  if (preparedMemories.length === 0) {
    return null;
  }

  const lines = preparedMemories.map((entry) => `- ${entry.memory}`);

  return [
    'What you know about this user from past conversations (use naturally; do not invent):',
    ...lines,
    'Rules:',
    '- Weave in knowledge naturally — never mention "memory", "stored", or "you told me to remember".',
    '- Current transcript overrides stale facts.',
    '- Companion profile fields take precedence.',
    '- Do not force irrelevant memories into the answer.',
  ].join('\n');
}

export function buildRecentTurnsBlock(turns: ConversationTurn[]): string | null {
  if (turns.length === 0) {
    return null;
  }

  const lines: string[] = [
    'Recent conversation with this user (most recent last; continue naturally):',
  ];

  for (const turn of turns) {
    lines.push(`User: ${turn.userTranscript}`);
    if (turn.assistantSpoken?.trim()) {
      lines.push(`Assistant: ${turn.assistantSpoken.trim()}`);
    }
  }

  lines.push('Rules: Treat this as ongoing dialogue. Do not repeat yourself verbatim.');

  return lines.join('\n');
}
