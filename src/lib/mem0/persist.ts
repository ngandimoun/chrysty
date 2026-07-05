import { getMem0Client } from '@/lib/mem0/client';
import { getMem0AgentId, isMem0Enabled } from '@/lib/mem0/config';
import { shouldUseMem0ForTranscript } from '@/lib/mem0/policy';

export async function persistTurnToMem0(
  userId: string,
  transcript: string,
  spokenResponse: string,
): Promise<void> {
  if (!isMem0Enabled() || !userId.trim()) {
    return;
  }

  const userText = transcript.trim();
  const assistantText = spokenResponse.trim();
  if (!userText || !assistantText || !shouldUseMem0ForTranscript(userText)) {
    return;
  }

  const client = getMem0Client();
  if (!client) {
    return;
  }

  try {
    await client.add(
      [
        { role: 'user', content: userText },
        { role: 'assistant', content: assistantText },
      ],
      { userId, agentId: getMem0AgentId() },
    );
  } catch (error) {
    console.error('[mem0] add failed', error);
  }
}
