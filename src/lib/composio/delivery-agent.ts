/**
 * Post-Mastra Composio delivery: after a background job finalizes, optionally
 * run a short Interactions pass with Composio tools only. Mastra never calls
 * Composio mid-crew — this agent handles send/post/share when the objective asked for it.
 */

import { GoogleGenAI } from '@google/genai';

import type { AstraBackgroundJobRow } from '@/lib/background-jobs/types';
import { appendJobLog, getBackgroundJob, updateBackgroundJob } from '@/lib/background-jobs/db';
import { getGeminiApiKey, getGeminiResponseModel } from '@/lib/gemini/config';
import {
  executeComposioToolCall,
  isComposioFunctionToolName,
  isComposioToolsEnabled,
  loadComposioFunctionDeclarations,
} from '@/lib/composio/tools';

const MAX_ROUNDS = 4;

type InteractionLike = {
  id?: string;
  output_text?: string | null;
  steps?: unknown[];
  outputs?: unknown[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function extractFunctionCalls(interaction: InteractionLike): Array<{
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}> {
  const calls: Array<{ id: string; name: string; arguments: Record<string, unknown> }> = [];
  const seen = new Set<string>();

  const addCall = (record: Record<string, unknown> | null) => {
    if (!record || record.type !== 'function_call') return;
    const name = typeof record.name === 'string' ? record.name.trim() : '';
    const id = typeof record.id === 'string' ? record.id.trim() : '';
    if (!name || !id || seen.has(id)) return;
    seen.add(id);
    const args = asRecord(record.arguments) ?? {};
    calls.push({ id, name, arguments: args });
  };

  for (const step of interaction.steps ?? []) addCall(asRecord(step));
  for (const output of interaction.outputs ?? []) addCall(asRecord(output));
  return calls;
}

function truncate(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}…`;
}

async function appendDeliveryLog(jobId: string, text: string): Promise<void> {
  const current = await getBackgroundJob(jobId);
  if (!current) return;
  await updateBackgroundJob(jobId, {
    progress: appendJobLog(current.progress, text),
  });
}

/**
 * Best-effort delivery after a successful job finalize.
 * Never throws to the caller — failures are logged on the job when possible.
 */
export async function runComposioDeliveryAfterJob(job: AstraBackgroundJobRow): Promise<void> {
  const userId = job.user_id?.trim();
  if (!userId || !isComposioToolsEnabled()) return;

  let apiKey: string;
  try {
    apiKey = getGeminiApiKey();
  } catch {
    return;
  }

  let tools;
  try {
    tools = await loadComposioFunctionDeclarations(userId);
  } catch (error) {
    console.warn(
      '[composio/delivery] load tools failed',
      job.id,
      error instanceof Error ? error.message : error,
    );
    return;
  }

  if (tools.length === 0) {
    await appendDeliveryLog(
      job.id,
      'Connected-app delivery skipped — no toolkit tools available (connect in Settings if needed)',
    ).catch(() => {});
    return;
  }

  const documentList =
    (job.document_ids?.length ?? 0) > 0
      ? job.document_ids.map((id) => `- document id ${id}`).join('\n')
      : '(document ids unavailable)';

  const system = `You are Chrysty's post-research delivery agent.
You only act when the original objective clearly asked to send, post, share, email, or publish the finished work via a connected app.
If there is no such delivery intent, reply with exactly: NO_DELIVERY
If delivery is needed but a required app tool is missing, reply briefly that Settings → Connection is needed — do not invent OAuth links.
Use only the function tools provided. Prefer the finished summary and objective; do not invent facts.
Never mention Composio or internal tool names to anyone.`;

  const userPrompt = `## Original objective
"""${truncate(job.objective, 6000)}"""

## Job title
${job.title}

## Spoken / result summary
${truncate(job.result_summary || '(none)', 4000)}

## Workspace documents
${documentList}

Decide: deliver via connected-app tools if the objective asked for it, otherwise NO_DELIVERY.`;

  const client = new GoogleGenAI({ apiKey });
  const model = getGeminiResponseModel();
  const completed = new Set<string>();

  try {
    let interaction = (await client.interactions.create({
      model,
      store: true,
      system_instruction: system,
      input: userPrompt,
      tools,
    })) as InteractionLike;

    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      const text = interaction.output_text?.trim() ?? '';
      if (text) {
        const note = text.toUpperCase().includes('NO_DELIVERY')
          ? 'Connected-app delivery: none requested'
          : `Connected-app delivery: ${truncate(text, 240)}`;
        await appendDeliveryLog(job.id, note).catch(() => {});
        break;
      }

      const calls = extractFunctionCalls(interaction).filter(
        (call) => !completed.has(call.id) && isComposioFunctionToolName(call.name),
      );
      if (calls.length === 0) break;

      const results = await Promise.all(
        calls.map(async (call) => {
          try {
            const result = await executeComposioToolCall(userId, call.name, call.arguments);
            return {
              type: 'function_result' as const,
              name: call.name,
              call_id: call.id,
              result:
                typeof result === 'string' || (result && typeof result === 'object')
                  ? (result as string | Record<string, unknown>)
                  : JSON.stringify(result),
            };
          } catch (error) {
            return {
              type: 'function_result' as const,
              name: call.name,
              call_id: call.id,
              is_error: true as const,
              result: {
                error: error instanceof Error ? error.message : 'Tool failed',
              },
            };
          }
        }),
      );

      for (const call of calls) completed.add(call.id);

      if (!interaction.id) break;
      interaction = (await client.interactions.create({
        model,
        store: true,
        previous_interaction_id: interaction.id,
        system_instruction: system,
        input: results,
        tools,
      })) as InteractionLike;
    }

    if (completed.size > 0) {
      await appendDeliveryLog(
        job.id,
        `Connected-app delivery ran ${completed.size} tool call(s)`,
      ).catch(() => {});
    }
  } catch (error) {
    console.warn(
      '[composio/delivery] failed',
      job.id,
      error instanceof Error ? error.message : error,
    );
    await appendDeliveryLog(
      job.id,
      `Connected-app delivery failed: ${
        error instanceof Error ? truncate(error.message, 160) : 'unknown error'
      }`,
    ).catch(() => {});
  }
}

/** Fire-and-forget wrapper so finalize never blocks on delivery. */
export function scheduleComposioDeliveryAfterJob(job: AstraBackgroundJobRow): void {
  void runComposioDeliveryAfterJob(job).catch((error) => {
    console.warn(
      '[composio/delivery] unhandled',
      job.id,
      error instanceof Error ? error.message : error,
    );
  });
}
