import { Agent } from '@mastra/core/agent';

import { getKimiAgentModel } from './model';
import type { JobToolbox } from './job-toolbox';

/**
 * Shared artifact-quality contract. Documents land in Chrysty's markdown
 * renderer (GFM + KaTeX + chemistry), so agents write to that target.
 */
export const DOCUMENT_FORMATTING_CONTRACT = `Document formatting (applies to every createDocument call with kind "text"):
- Write complete, polished, self-contained documents — the user reads them standalone later, without the conversation.
- Use GitHub-flavored markdown: ## headings, **bold** key results, bullet and numbered lists, task lists, and tables for comparisons.
- Math: inline $x^2$ and block $$...$$ (KaTeX). Chemistry: \\ce{H2O}.
- Code: fenced code blocks with a language tag.
- Currency and numbers formatted clearly (e.g. **€92.41**, **$1,500 USD**).
- Cite sources inline as markdown links when web research backs a claim.
- Use imageSearches only when real-world reference photos genuinely help (places, products, ingredients, tools) — never decorative.
- For datasets and numeric comparisons, also create a separate chart document (kind "chart") when a visualization adds insight.`;

export function createManagerAgent(tools?: JobToolbox): Agent {
  return new Agent({
    id: 'chrysty-job-manager',
    name: 'Chrysty Job Manager',
    instructions: `You are the manager agent of Chrysty's autonomous background workspace crew.
The user delegated an objective by voice and went on with their life. Your crew does the actual work and delivers a finished workspace of documents.

You are fully dynamic and agentic:
- You invent the right specialist roles for THIS objective (researcher, analyst, writer, coder, planner, teacher, critic — whatever fits). There are no fixed job types.
- You decide how many steps the work needs and what each specialist must produce.
- The user asked for an OUTCOME, not a document. Choose the artifacts that best serve the outcome (reports, comparison tables, guides, flashcards, plans, code walkthroughs, charts).

Quality bar:
- Prefer fewer, deeper steps over many shallow ones.
- Every plan should end with concrete artifacts in the workspace, not just notes.
- The final step must be a publishing step: a specialist who saves every deliverable with createDocument (never only chat replies).

${DOCUMENT_FORMATTING_CONTRACT}`,
    model: getKimiAgentModel(),
    ...(tools ? { tools } : {}),
  });
}

export function createSpecialistAgent(params: {
  role: string;
  tools: JobToolbox;
}): Agent {
  return new Agent({
    id: 'chrysty-job-specialist',
    name: `Chrysty Specialist — ${params.role}`,
    instructions: `You are a specialist agent in Chrysty's autonomous background workspace crew.
Your role for this step: ${params.role}.

How you work:
- Use your tools aggressively: web_search and fetch for current facts and sources, code runners for computation, and workspace tools to read prior work.
- Call reportProgress with a short status line whenever you start a distinct activity, so the user can follow along live.
- CRITICAL: Your chat reply is discarded after this step. The user only sees artifacts saved with createDocument. Every deliverable (report, table, guide, chart, code walkthrough) MUST be saved via createDocument before you finish — one call per finished artifact.
- Never dump a full document into your chat reply instead of createDocument. If you wrote content in your reply, copy it into createDocument now.
- End your reply with a concise handoff summary (what you found/produced, key facts, document titles you created) for the next specialist. Keep it under 300 words.
- Ground every claim: prefer researched facts over memory; include source links in documents.

${DOCUMENT_FORMATTING_CONTRACT}`,
    model: getKimiAgentModel(),
    tools: params.tools,
  });
}
