import { fetchRecentTurns } from '@/lib/astra/db/conversation-history';
import { fetchUserEcosystemActivity } from '@/lib/astra/ecosystem-activity';
import { listBackgroundJobs } from '@/lib/background-jobs/db';
import { isBackgroundJobsEnabled, resolveJobOrigin } from '@/lib/background-jobs/kickoff';
import {
  buildBackgroundDelegationBlock,
  buildBackgroundJobsStatusBlock,
  summarizeJobsForPrompt,
} from '@/lib/gemini/background-delegation';
import { buildCompanionProfileBlock, type CompanionProfile } from '@/lib/gemini/companion-profile';
import { buildChrystyEcosystemBlock } from '@/lib/gemini/chrysty-ecosystem';
import { getGeminiTtsVoice } from '@/lib/gemini/config';
import { buildUserTemporalContextBlock, type UserContext } from '@/lib/gemini/user-context';
import { getLiveSession } from '@/lib/live/db';
import type { LiveHistoryMessage, LiveSessionContextResponse, LiveSessionMode } from '@/lib/live/types';
import { buildMemoriesBlock, buildRecentTurnsBlock } from '@/lib/mem0/prompt-block';
import { searchUserMemories } from '@/lib/mem0/search';
import type { MemoryContext } from '@/lib/mem0/types';

const LIVE_SYSTEM_RULES = `## Gemini Live voice rules
You are Chrysty in a real-time voice session. Speak naturally and concisely.
- Use fast custom tools for simple math, dates, units, weather, and device context.
- Call delegateToStructuredLLM when the user needs web search, URL reading, code/charts, rich visual explanations, background research jobs, or anything you cannot do with fast tools alone.
- Never mention delegateToStructuredLLM or internal tools to the user.
- If delegateToStructuredLLM is running and the user adds detail, acknowledge briefly; do not restart delegation unless they change the task entirely.
- For background work, speak only a short confirmation after delegation — do not attempt the full deliverable in voice.
- In live_guide mode, use updateLiveGuideOverlay for spatial coaching on the camera frame.
- Continue naturally from prior context; do not re-introduce yourself unless the user asks who you are.`;

export interface BuildLiveSessionContextInput {
  session_id: string;
  astra_key: string;
  workspace_id: string;
  user_id?: string;
  memory_user_id: string;
  companion_profile?: CompanionProfile;
  user_context?: UserContext;
  mode?: LiveSessionMode;
  resumption_handle?: string | null;
  origin?: string;
}

export async function buildLiveSessionContext(
  input: BuildLiveSessionContextInput,
): Promise<LiveSessionContextResponse> {
  const memoryContext: MemoryContext = {
    workspaceId: input.workspace_id,
    astraKey: input.astra_key,
    memoryUserId: input.memory_user_id,
    userId: input.user_id,
  };

  const sessionState = await getLiveSession(input.session_id);
  const recentTurns = await fetchRecentTurns({
    workspaceId: input.workspace_id,
    astraKey: input.astra_key,
  });

  const seedQuery =
    recentTurns.length > 0
      ? recentTurns[recentTurns.length - 1]?.userTranscript ?? 'continue our conversation'
      : 'continue our conversation';

  const [memories, ecosystemActivity, jobSummaries] = await Promise.all([
    searchUserMemories(memoryContext.memoryUserId, seedQuery),
    input.user_id ? fetchUserEcosystemActivity(input.user_id) : Promise.resolve(null),
    isBackgroundJobsEnabled()
      ? listBackgroundJobs(input.astra_key, 8)
          .then((jobs) => summarizeJobsForPrompt(jobs))
          .catch(() => [])
      : Promise.resolve([]),
  ]);

  const blocks: string[] = [
    `You are Chrysty, the voice companion for the Chrysty ecosystem.`,
    LIVE_SYSTEM_RULES,
  ];

  if (input.user_context) {
    blocks.push(buildUserTemporalContextBlock(input.user_context));
  }

  if (input.companion_profile) {
    blocks.push(buildCompanionProfileBlock(input.companion_profile));
  }

  const recentTurnsBlock = buildRecentTurnsBlock(recentTurns);
  if (recentTurnsBlock) blocks.push(recentTurnsBlock);

  const memoriesBlock = buildMemoriesBlock(memories);
  if (memoriesBlock) blocks.push(memoriesBlock);

  blocks.push(buildChrystyEcosystemBlock(input.companion_profile, seedQuery, ecosystemActivity));

  if (isBackgroundJobsEnabled()) {
    blocks.push(buildBackgroundDelegationBlock());
    const jobsBlock = buildBackgroundJobsStatusBlock(jobSummaries);
    if (jobsBlock) blocks.push(jobsBlock);
  }

  const mode = input.mode ?? sessionState?.mode ?? 'default';
  let reconnectNote: string | null = null;

  if (sessionState?.live_guide_state?.task?.name) {
    const task = sessionState.live_guide_state.task;
    reconnectNote = `You were coaching the user on "${task.name}"${task.stage ? ` at stage "${task.stage}"` : ''}. Continue from there naturally.`;
    blocks.push(
      `Live Guide is active. Task: ${task.name ?? 'unknown'}${task.stage ? `; stage: ${task.stage}` : ''}${task.progress ? `; progress: ${task.progress}` : ''}.`,
    );
  } else if (recentTurns.length > 0) {
    reconnectNote = 'Continue the ongoing conversation naturally. Do not greet as if this is a brand-new session.';
  }

  if (input.resumption_handle || sessionState?.resumption_handle) {
    blocks.push('This is a resumed live session after a brief reconnect. Maintain continuity.');
  }

  const initial_history: LiveHistoryMessage[] = recentTurns.flatMap((turn) => {
    const messages: LiveHistoryMessage[] = [{ role: 'user', text: turn.userTranscript }];
    if (turn.assistantSpoken?.trim()) {
      messages.push({ role: 'assistant', text: turn.assistantSpoken.trim() });
    }
    return messages;
  });

  return {
    system_instruction: blocks.filter(Boolean).join('\n\n'),
    initial_history,
    session_state: sessionState,
    voice_name: getGeminiTtsVoice(),
    reconnect_note: reconnectNote,
  };
}
