import { z } from 'zod';

import {
  addGeneratedDocument,
  getGeneratedDocument,
  getGeneratedDocumentBySourceKey,
  mutateGeneratedDocument,
} from '@/lib/astra/db/documents';
import { buildUpdatedTextPayload, getDocumentFullText } from '@/lib/documents/document-content';
import { truncateTitle } from '@/lib/documents/generated-document-types';
import {
  buildLivingDocumentSource,
  livingDocumentSourceKey,
  objectiveRequestsMultipleDeliverables,
  upsertLivingDocumentSection,
} from '@/lib/documents/living-document';
import { createManagerAgent, createSpecialistAgent } from '@/mastra/agents';
import { buildJobToolbox, type JobScope, type JobToolbox } from '@/mastra/job-toolbox';

import {
  appendJobLog,
  getBackgroundJob,
  listJobDocuments,
  updateBackgroundJob,
} from './db';
import { kickoffJobLegSafe, resolveConfiguredJobOrigin, resolveJobOrigin } from './kickoff';
import type {
  AstraBackgroundJobRow,
  JobPlan,
  JobProgress,
  JobProgressStep,
  JobStepNote,
} from './types';

const DEFAULT_LEG_BUDGET_MS = 230_000;
/** Minimum time we need before starting another step in this leg. */
const STEP_RESERVE_MS = 70_000;
const MAX_LEGS = 40;
const MAX_STEP_ATTEMPTS = 2;

interface LegBudget {
  deadline: number;
  remaining: () => number;
}

function createLegBudget(): LegBudget {
  const raw = Number.parseInt(process.env.ASTRA_JOB_LEG_BUDGET_MS ?? '', 10);
  const budgetMs = Number.isFinite(raw) && raw > 30_000 ? raw : DEFAULT_LEG_BUDGET_MS;
  const deadline = Date.now() + budgetMs;
  return { deadline, remaining: () => deadline - Date.now() };
}

function shouldDebug(): boolean {
  return process.env.NODE_ENV === 'development' || process.env.DEBUG_BACKGROUND_JOBS === 'true';
}

function debugLog(...args: unknown[]): void {
  if (shouldDebug()) console.debug('[background-jobs]', ...args);
}

function truncate(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max)}\n…[truncated]`;
}

function isQuotaError(detail: string): boolean {
  const lower = detail.toLowerCase();
  return (
    lower.includes('tpd rate limit') ||
    lower.includes('rate limit') && lower.includes('organization') ||
    lower.includes('quota') ||
    lower.includes('insufficient_quota')
  );
}

function isRetryableStepError(detail: string): boolean {
  const lower = detail.toLowerCase();
  if (isQuotaError(detail)) return false;
  return (
    /abort|timeout|timed out/i.test(detail) ||
    /\b429\b/.test(detail) ||
    /\b5\d{2}\b/.test(detail) ||
    lower.includes('network') ||
    lower.includes('econnreset') ||
    lower.includes('fetch failed') ||
    lower.includes('socket hang up')
  );
}

function stepExpectsArtifact(instructions: string): boolean {
  const lower = instructions.toLowerCase();
  return (
    lower.includes('createdocument') ||
    lower.includes('create document') ||
    lower.includes('save') ||
    lower.includes('artifact') ||
    lower.includes('deliverable') ||
    lower.includes('markdown document') ||
    lower.includes('kind "chart"') ||
    lower.includes('kind chart')
  );
}

const PLAN_SCHEMA = z.object({
  title: z.string().describe('Short workspace title for this job, 3-7 words'),
  approach: z.string().describe('One paragraph describing how the crew will tackle the objective'),
  steps: z
    .array(
      z.object({
        title: z.string().describe('Short step title shown to the user'),
        role: z.string().describe('Specialist role you invent for this step, e.g. "market researcher"'),
        instructions: z
          .string()
          .describe('Detailed instructions for the specialist: what to do, what to produce, quality bar'),
      }),
    )
    .min(1)
    .max(8),
});

const FINAL_SCHEMA = z.object({
  spokenSummary: z
    .string()
    .describe('2-4 conversational sentences summarizing what was accomplished, ready to be spoken aloud'),
  overviewMarkdown: z
    .string()
    .describe('Final-summary section in markdown: what was produced, key findings, and suggested next steps'),
});

function progressStepsFromPlan(plan: JobPlan): JobProgressStep[] {
  return plan.steps.map((step) => ({ id: step.id, title: step.title, status: 'pending' as const }));
}

function setProgressStep(
  progress: JobProgress,
  stepId: string,
  status: JobProgressStep['status'],
  detail?: string,
): JobProgress {
  return {
    ...progress,
    steps: (progress.steps ?? []).map((step) =>
      step.id === stepId ? { ...step, status, ...(detail ? { detail } : {}) } : step,
    ),
  };
}

async function planJob(job: AstraBackgroundJobRow): Promise<AstraBackgroundJobRow> {
  const manager = createManagerAgent();

  const prompt = `The user delegated this objective by voice:

"""${job.objective}"""

Use BCP-47 language ${job.artifact_language || 'en'} for the plan, specialist instructions, artifacts, and final summary.

Design the execution plan for your specialist crew. Remember: dynamic roles, fewer-but-deeper steps, and one primary living document by default. Every producing step must update a stable, clearly named section with createDocument. Only plan separate files when the objective above explicitly requests multiple deliverables. The last step must polish the same living document, not create a separate overview.`;

  const result = await manager.generate(prompt, {
    structuredOutput: { schema: PLAN_SCHEMA, jsonPromptInjection: true },
    // Kimi k2.x rejects non-default temperatures; rely on model defaults.
    modelSettings: { maxOutputTokens: 4096 },
    maxSteps: 1,
  });

  const parsed = result.object;
  if (!parsed || !Array.isArray(parsed.steps) || parsed.steps.length === 0) {
    throw new Error('Manager did not return a usable plan.');
  }

  const plan: JobPlan = {
    approach: parsed.approach,
    steps: parsed.steps.map((step, index) => ({
      id: `step-${index + 1}`,
      title: step.title,
      role: step.role,
      instructions: step.instructions,
    })),
  };

  let progress: JobProgress = {
    activity: `Planned ${plan.steps.length} step${plan.steps.length === 1 ? '' : 's'} — starting work`,
    steps: progressStepsFromPlan(plan),
    log: job.progress.log ?? [],
  };
  progress = appendJobLog(progress, `Plan ready: ${plan.steps.map((step) => step.title).join(' → ')}`);

  return updateBackgroundJob(job.id, {
    status: 'running',
    plan,
    title: truncateTitle(parsed.title || job.title, 80),
    working_state: { nextStepIndex: 0, notes: [] },
    progress,
    heartbeat_at: new Date().toISOString(),
  });
}

const MAX_PLAN_ATTEMPTS = 3;

async function planJobWithRetry(job: AstraBackgroundJobRow): Promise<AstraBackgroundJobRow> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= MAX_PLAN_ATTEMPTS; attempt++) {
    try {
      return await planJob(job);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const detail = lastError.message;
      if (isQuotaError(detail)) throw lastError;

      const retryable =
        detail.includes('usable plan') ||
        isRetryableStepError(detail);

      if (attempt < MAX_PLAN_ATTEMPTS && retryable) {
        debugLog(`plan attempt ${attempt}/${MAX_PLAN_ATTEMPTS} failed — retrying`, detail);
        await updateBackgroundJob(job.id, {
          progress: appendJobLog(
            job.progress,
            `Planning attempt ${attempt} failed — retrying (${truncate(detail, 120)})`,
          ),
          heartbeat_at: new Date().toISOString(),
        });
        await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
        continue;
      }

      throw lastError;
    }
  }

  throw lastError ?? new Error('Manager did not return a usable plan.');
}

function buildStepPrompt(job: AstraBackgroundJobRow, stepIndex: number): string {
  const plan = job.plan!;
  const step = plan.steps[stepIndex]!;
  const notes = job.working_state.notes ?? [];

  const planOverview = plan.steps
    .map((item, index) => {
      const marker = index < stepIndex ? '[done]' : index === stepIndex ? '[YOU ARE HERE]' : '[later]';
      return `${index + 1}. ${marker} ${item.title} (${item.role})`;
    })
    .join('\n');

  const priorNotes =
    notes.length > 0
      ? notes
          .map((note) => `### ${note.title}\n${note.summary}`)
          .join('\n\n')
      : '(none yet — you are the first step)';

  return `## Delegated objective
"""${job.objective}"""

## Required artifact language
${job.artifact_language || 'en'} — use this language for saved content and handoff summaries.

## Crew plan (manager's approach: ${plan.approach})
${planOverview}

## Handoff notes from previous specialists
${priorNotes}

## Your step: ${step.title}
${step.instructions}

Work now. Use tools, report progress, update your clearly named section with createDocument, and end with your handoff summary. Reuse the same sectionName on retries.`;
}

async function runStep(
  job: AstraBackgroundJobRow,
  stepIndex: number,
  toolbox: JobToolbox,
  budget: LegBudget,
  scope: JobScope,
): Promise<{ note: JobStepNote; failed: boolean; detail?: string; quotaExceeded?: boolean }> {
  const step = job.plan!.steps[stepIndex]!;
  const specialist = createSpecialistAgent({ role: step.role, tools: toolbox });

  const timeoutMs = Math.max(30_000, budget.remaining() - 20_000);
  const abortSignal = AbortSignal.timeout(timeoutMs);

  const docsBefore = await listJobDocuments(scope.astraKey, scope.jobId);
  const revisionBefore = new Map(docsBefore.map((document) => [document.id, document.revision]));

  try {
    const result = await specialist.generate(buildStepPrompt(job, stepIndex), {
      maxSteps: 20,
      abortSignal,
      modelSettings: { maxOutputTokens: 8192 },
    });

    let summary = truncate(result.text || '(specialist produced no summary)', 4000);

    const docsAfterFirst = await listJobDocuments(scope.astraKey, scope.jobId);
    const documentChanged =
      docsAfterFirst.length !== docsBefore.length ||
      docsAfterFirst.some(
        (document) => (revisionBefore.get(document.id) ?? 0) !== document.revision,
      );
    const expectsArtifact = stepExpectsArtifact(step.instructions);

    if (expectsArtifact && !documentChanged && budget.remaining() > 45_000) {
      debugLog(`step ${step.id} produced no documents — running save nudge`);
      try {
        const nudgeSignal = AbortSignal.timeout(Math.max(30_000, budget.remaining() - 15_000));
        await specialist.generate(
          `Your previous reply is discarded. The user cannot see chat text — only createDocument saves artifacts.

Save this step now by updating a stable, clearly named section of the living document with createDocument. Use the content you already prepared and reuse the same sectionName on retries.

Step: ${step.title}
${step.instructions}

After saving, reply with only a one-line confirmation naming the section you updated.`,
          {
            maxSteps: 8,
            abortSignal: nudgeSignal,
            modelSettings: { maxOutputTokens: 8192 },
          },
        );
        summary = `${summary}\n\n[Save nudge ran — check createDocument calls above]`;
      } catch (nudgeError) {
        debugLog('save nudge failed', nudgeError);
      }
    }

    return {
      note: { stepId: step.id, title: step.title, summary },
      failed: false,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Step failed';
    return {
      note: {
        stepId: step.id,
        title: step.title,
        summary: `Step failed: ${truncate(detail, 500)}`,
      },
      failed: true,
      detail,
      quotaExceeded: isQuotaError(detail),
    };
  }
}

async function runSalvagePublisher(
  job: AstraBackgroundJobRow,
  scope: JobScope,
  toolbox: JobToolbox,
  budget: LegBudget,
): Promise<void> {
  const documents = await listJobDocuments(scope.astraKey, scope.jobId);
  if (documents.length > 0) return;

  const notes = job.working_state.notes ?? [];
  const successfulNotes = notes.filter((note) => {
    const step = job.plan?.steps.find((item) => item.id === note.stepId);
    return step && !note.summary.startsWith('Step failed:');
  });

  if (successfulNotes.length === 0) return;
  if (budget.remaining() < 60_000) return;

  debugLog(`job ${job.id} has zero documents — running salvage publisher`);

  const notesBlock = successfulNotes.map((note) => `### ${note.title}\n${note.summary}`).join('\n\n');
  const publisher = createSpecialistAgent({ role: 'workspace publisher', tools: toolbox });

  try {
    await publisher.generate(
      `## Delegated objective
"""${job.objective}"""

## Specialist handoff notes (content may only exist here — not yet saved)
${notesBlock}

You are the salvage publisher. No documents exist in the workspace yet. Compile the useful work above into one polished primary living document with clearly named sections. Only use separate files if the delegated objective explicitly requires them. The user ONLY sees saved documents — save now.`,
      {
        maxSteps: 12,
        abortSignal: AbortSignal.timeout(Math.max(45_000, budget.remaining() - 20_000)),
        modelSettings: { maxOutputTokens: 8192 },
      },
    );
  } catch (error) {
    debugLog('salvage publisher failed', error);
  }
}

async function finalizeJob(job: AstraBackgroundJobRow, scope: JobScope): Promise<void> {
  const manager = createManagerAgent();
  const notes = job.working_state.notes ?? [];
  const documents = await listJobDocuments(job.astra_key, job.id);

  const documentList =
    documents.length > 0
      ? documents.map((doc) => `- ${doc.title} (${doc.kind})`).join('\n')
      : '(no documents were created)';

  const notesBlock = notes.map((note) => `### ${note.title}\n${note.summary}`).join('\n\n');

  const prompt = `The crew finished working on this delegated objective:

"""${job.objective}"""

## Specialist handoff notes
${notesBlock || '(none)'}

## Documents created in the workspace
${documentList}

Write both outputs in ${job.artifact_language || 'en'}.

Write the final wrap-up: a short spoken summary for the user, and a concise final-summary section for the primary living document (key findings, what was produced, suggested next steps). Do not propose a separate overview file.`;

  let spokenSummary = `I finished working on: ${job.title}. Your workspace documents are ready.`;
  let overviewMarkdown = '';

  try {
    const result = await manager.generate(prompt, {
      structuredOutput: { schema: FINAL_SCHEMA, jsonPromptInjection: true },
      modelSettings: { maxOutputTokens: 6144 },
      maxSteps: 1,
    });
    if (result.object?.spokenSummary) spokenSummary = result.object.spokenSummary;
    if (result.object?.overviewMarkdown) overviewMarkdown = result.object.overviewMarkdown;
  } catch (error) {
    debugLog('finalize generation failed, using fallback summary', error);
  }

  if (overviewMarkdown.trim()) {
    try {
      const explicitMultiple = objectiveRequestsMultipleDeliverables(job.objective);
      const primarySourceKey = livingDocumentSourceKey(job.id, 'primary');
      let primary = await getGeneratedDocumentBySourceKey(job.astra_key, primarySourceKey);
      if (!primary && explicitMultiple) {
        const firstText = documents.find((document) => document.kind === 'text');
        primary = firstText ? await getGeneratedDocument(job.astra_key, firstText.id) : null;
      }

      if (primary?.kind === 'text') {
        const record = {
          id: primary.id,
          kind: 'text' as const,
          title: primary.title,
          createdAt: new Date(primary.created_at).getTime(),
          updatedAt: new Date(primary.updated_at).getTime(),
          jsonPayload: primary.json_payload ?? undefined,
          revision: primary.revision,
        };
        const fullText = upsertLivingDocumentSection({
          currentMarkdown: getDocumentFullText(record),
          sectionKey: 'final-summary',
          sectionTitle: 'Final Summary',
          markdown: overviewMarkdown.trim(),
        });
        await mutateGeneratedDocument({
          astraKey: scope.astraKey,
          documentId: primary.id,
          expectedRevision: primary.revision,
          action: 'update',
          jsonPayload: buildUpdatedTextPayload(record.jsonPayload, fullText),
          userId: scope.userId,
          sessionId: `background-job:${job.id}`,
          metadata: { source: 'background_finalization', job_id: job.id, section_key: 'final-summary' },
        });
      } else if (!primary) {
        const fullText = upsertLivingDocumentSection({
          currentMarkdown: '',
          sectionKey: 'final-summary',
          sectionTitle: 'Final Summary',
          markdown: overviewMarkdown.trim(),
        });
        await addGeneratedDocument({
          workspaceId: scope.workspaceId,
          astraKey: scope.astraKey,
          userId: scope.userId,
          kind: 'text',
          title: truncateTitle(job.title, 80),
          jsonPayload: JSON.stringify({ fullText }),
          jobId: job.id,
          sourceKey: primarySourceKey,
          sourceMetadata: buildLivingDocumentSource(job.id, 'primary', explicitMultiple),
          auditMetadata: { created_by: 'background_finalization' },
          artifactLanguage: job.artifact_language || 'en',
        });
      }
    } catch (error) {
      debugLog('living document finalization failed', error);
    }
  }

  const finalDocuments = await listJobDocuments(job.astra_key, job.id);
  const failedSteps = (job.progress.steps ?? []).filter((step) => step.status === 'failed');
  const successfulSteps = (job.progress.steps ?? []).filter((step) => step.status === 'done');
  const allStepsFailed = successfulSteps.length === 0 && failedSteps.length > 0;
  const nothingProduced = finalDocuments.length === 0;

  let progress: JobProgress = {
    ...job.progress,
    activity:
      failedSteps.length > 0
        ? `Completed with ${failedSteps.length} failed step${failedSteps.length === 1 ? '' : 's'}`
        : 'Completed',
  };
  progress = appendJobLog(progress, `Done — ${finalDocuments.length} document(s) in the workspace`);

  if (allStepsFailed || nothingProduced) {
    const errorSummary =
      allStepsFailed && failedSteps.length > 0
        ? `All ${failedSteps.length} step(s) failed — no workspace artifacts were produced.`
        : 'Job finished without saving any documents to the workspace.';

    await updateBackgroundJob(job.id, {
      status: 'failed',
      error: errorSummary,
      result_summary: spokenSummary,
      document_ids: finalDocuments.map((doc) => doc.id),
      progress: appendJobLog({ ...progress, activity: 'Failed' }, errorSummary),
      completed_at: new Date().toISOString(),
      heartbeat_at: new Date().toISOString(),
    });
    return;
  }

  await updateBackgroundJob(job.id, {
    status: 'completed',
    result_summary: spokenSummary,
    document_ids: finalDocuments.map((doc) => doc.id),
    progress,
    completed_at: new Date().toISOString(),
    heartbeat_at: new Date().toISOString(),
  });
}

function chainNextLeg(job: AstraBackgroundJobRow): void {
  // Prefer the currently configured origin: the origin stored on the job row
  // may be stale (e.g. http vs https), which would break every chained leg.
  const origin = resolveConfiguredJobOrigin() ?? job.origin ?? resolveJobOrigin();
  debugLog(`chaining next leg for job ${job.id}`);
  kickoffJobLegSafe(job.id, origin);
}

/**
 * Runs one serverless leg of a background job. Plans if needed, executes as many
 * plan steps as the time budget allows, checkpoints everything to Supabase, and
 * re-invokes itself when work remains.
 */
export async function runJobLeg(jobId: string): Promise<void> {
  const budget = createLegBudget();

  let job = await getBackgroundJob(jobId);
  if (!job) {
    console.warn(`[background-jobs] job ${jobId} not found`);
    return;
  }

  if (job.status === 'completed' || job.status === 'failed' || job.status === 'canceled') {
    debugLog(`job ${jobId} already terminal (${job.status})`);
    return;
  }

  if (job.leg_count >= MAX_LEGS) {
    await updateBackgroundJob(jobId, {
      status: 'failed',
      error: 'Job exceeded the maximum total runtime.',
      completed_at: new Date().toISOString(),
    });
    return;
  }

  job = await updateBackgroundJob(jobId, {
    leg_count: job.leg_count + 1,
    heartbeat_at: new Date().toISOString(),
    ...(job.status === 'queued' ? { status: 'planning' as const } : {}),
  });

  try {
    if (!job.plan) {
      job = await updateBackgroundJob(jobId, {
        progress: appendJobLog(
          { ...job.progress, activity: 'Understanding the objective and planning the work' },
          'Manager is planning the work',
        ),
      });
      job = await planJobWithRetry(job);
      debugLog(`job ${jobId} planned with ${job.plan?.steps.length} steps`);
    }

    const scope: JobScope = {
      jobId: job.id,
      workspaceId: job.workspace_id,
      astraKey: job.astra_key,
      userId: job.user_id ?? undefined,
      objective: job.objective,
      jobTitle: job.title,
      artifactLanguage: job.artifact_language || 'en',
    };

    const toolbox = await buildJobToolbox(scope);
    const attempts: Record<string, number> = { ...(job.working_state.attempts ?? {}) };

    while (true) {
      const stepIndex = job.working_state.nextStepIndex ?? 0;
      const totalSteps = job.plan!.steps.length;

      if (stepIndex >= totalSteps) break;

      if (budget.remaining() < STEP_RESERVE_MS) {
        debugLog(`job ${jobId} out of leg budget before step ${stepIndex + 1}, chaining`);
        chainNextLeg(job);
        return;
      }

      // Respect cancellation requested between steps.
      const fresh = await getBackgroundJob(jobId);
      if (!fresh || fresh.status === 'canceled') {
        debugLog(`job ${jobId} canceled, stopping`);
        return;
      }
      job = fresh;

      const step = job.plan!.steps[stepIndex]!;
      const attemptCount = (attempts[step.id] ?? 0) + 1;
      attempts[step.id] = attemptCount;

      let progress = setProgressStep(job.progress, step.id, 'running');
      progress = appendJobLog(
        { ...progress, activity: `${step.title} (${step.role})` },
        `Starting: ${step.title}`,
      );
      job = await updateBackgroundJob(jobId, {
        progress,
        working_state: { ...job.working_state, attempts },
        heartbeat_at: new Date().toISOString(),
      });

      const { note, failed, detail, quotaExceeded } = await runStep(
        job,
        stepIndex,
        toolbox,
        budget,
        scope,
      );

      if (quotaExceeded && detail) {
        await updateBackgroundJob(jobId, {
          status: 'failed',
          error: truncate(detail, 500),
          progress: appendJobLog(
            setProgressStep(job.progress, step.id, 'failed', truncate(detail, 200)),
            `Job failed: API quota exceeded`,
          ),
          completed_at: new Date().toISOString(),
          heartbeat_at: new Date().toISOString(),
        });
        return;
      }

      const isRetryable =
        failed && detail && isRetryableStepError(detail) && attemptCount < MAX_STEP_ATTEMPTS;

      if (isRetryable) {
        const retryProgress = appendJobLog(
          setProgressStep(job.progress, step.id, 'pending', 'Retrying in a fresh worker'),
          `Step "${step.title}" hit a transient error — retrying`,
        );
        job = await updateBackgroundJob(jobId, {
          progress: retryProgress,
          working_state: { ...job.working_state, attempts },
          heartbeat_at: new Date().toISOString(),
        });
        chainNextLeg(job);
        return;
      }

      const stepFailedForGood = failed;
      const notes = [...(job.working_state.notes ?? []), note];
      let nextProgress = setProgressStep(
        job.progress,
        step.id,
        stepFailedForGood ? 'failed' : 'done',
        stepFailedForGood ? truncate(detail ?? 'failed', 200) : undefined,
      );
      nextProgress = appendJobLog(
        nextProgress,
        stepFailedForGood ? `Step failed: ${step.title}` : `Finished: ${step.title}`,
      );

      job = await updateBackgroundJob(jobId, {
        working_state: {
          ...job.working_state,
          nextStepIndex: stepIndex + 1,
          notes,
          attempts,
        },
        progress: nextProgress,
        heartbeat_at: new Date().toISOString(),
      });

      debugLog(`job ${jobId} step ${stepIndex + 1}/${totalSteps} ${stepFailedForGood ? 'failed' : 'done'}`);
    }

    if (budget.remaining() < 45_000) {
      debugLog(`job ${jobId} out of budget before finalize, chaining`);
      chainNextLeg(job);
      return;
    }

    job = await updateBackgroundJob(jobId, {
      progress: appendJobLog(
        { ...job.progress, activity: 'Wrapping up — updating the living document' },
        'Finalizing results',
      ),
      heartbeat_at: new Date().toISOString(),
    });

    await runSalvagePublisher(job, scope, toolbox, budget);
    job = (await getBackgroundJob(jobId)) ?? job;

    await finalizeJob(job, scope);
    debugLog(`job ${jobId} completed`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Background job failed.';
    console.error(`[background-jobs] job ${jobId} leg failed:`, error);

    const current = await getBackgroundJob(jobId).catch(() => null);
    if (current && (current.status === 'planning' || current.status === 'running' || current.status === 'queued')) {
      await updateBackgroundJob(jobId, {
        status: 'failed',
        error: truncate(message, 500),
        progress: appendJobLog(
          { ...current.progress, activity: isQuotaError(message) ? 'Failed — API quota exceeded' : 'Failed' },
          `Job failed: ${truncate(message, 200)}`,
        ),
        completed_at: new Date().toISOString(),
      }).catch(() => {});
    }
  }
}
