import type { AstraBackgroundJobRow } from '@/lib/background-jobs/types';

export interface BackgroundJobPromptSummary {
  title: string;
  status: string;
  activity: string | null;
  resultSummary: string | null;
  minutesAgo: number;
}

export function summarizeJobsForPrompt(jobs: AstraBackgroundJobRow[]): BackgroundJobPromptSummary[] {
  return jobs.slice(0, 8).map((job) => ({
    title: job.title,
    status: job.status,
    activity: job.progress?.activity ?? null,
    resultSummary: job.result_summary,
    minutesAgo: Math.max(0, Math.round((Date.now() - new Date(job.created_at).getTime()) / 60_000)),
  }));
}

/** System-instruction guidance shown when delegateBackgroundTask is available this turn. */
export function buildBackgroundDelegationBlock(): string {
  return `## Background delegation (delegateBackgroundTask)
You are not just a conversational assistant — you can delegate real work to an autonomous background crew that researches the web, analyzes data, and creates documents over several minutes while the user gets on with their life.

When to delegate:
- The user asks for an OUTCOME that needs minutes of work: deep research, a full report, a market/competitor analysis, a study kit, a lesson plan, a trip plan, a comparison across many options, a long-form writing project.
- The request implies multiple artifacts (report + table + charts + guide) or reading many sources.

When NOT to delegate:
- Quick facts, greetings, single calculations, single-page lookups, quick "what is this?" photo questions, anything you can answer well right now. Answer those directly.

Photos and delegation:
- If the user captured photos AND asks for substantial work based on them (research the products in this photo, plan around this place, compare these items, turn this document into a report), DO delegate.
- The background crew CANNOT see images. Pass everything task-relevant through the visualContext parameter: visible text, brand/product names, model numbers, prices, quantities, locations, layout, condition, and anything the user pointed at or annotated. Be exhaustive — whatever you leave out is lost.

How to delegate:
- Call delegateBackgroundTask with a rich objective: restate the user's goal completely, folding in every relevant detail from the conversation (constraints, budget, dates, preferences, prior context). The crew sees only this objective.
- When photos were captured this turn, also fill visualContext with a thorough description of what the images show.
- Then respond immediately: spoken_transcript confirms the work has started, says roughly what will be produced and that it takes a few minutes, and that results will appear in their Documents workspace. Keep it natural and brief.
- Do NOT attempt to produce the full deliverable yourself in the same turn, and do not wait for results — they arrive later.
- The user can keep talking to you, ask about progress, or start more background jobs meanwhile.`;
}

/** Live status of the user's background jobs for progress questions and completion announcements. */
export function buildBackgroundJobsStatusBlock(jobs: BackgroundJobPromptSummary[]): string {
  if (jobs.length === 0) return '';

  const lines = jobs.map((job) => {
    const base = `- "${job.title}" — ${job.status}, started ${job.minutesAgo} min ago`;
    if (job.status === 'completed' && job.resultSummary) {
      return `${base}. Result: ${job.resultSummary}`;
    }
    if (job.activity) {
      return `${base}. Currently: ${job.activity}`;
    }
    return base;
  });

  return `## User's background jobs (live status)
${lines.join('\n')}

Use this when the user asks how their delegated work is going. If a job just completed, mention it naturally and point them to their Documents workspace. Do not invent progress beyond what is listed.`;
}
