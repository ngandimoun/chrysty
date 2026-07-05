import { CHRYSTY_PROD_WORKERS } from '@/lib/astra/chrysty-workers';
import type { UserEcosystemActivity } from '@/lib/astra/ecosystem-activity';
import type { CompanionProfile } from '@/lib/gemini/companion-profile';

const AMBIGUOUS_SINGLE_WORD_SIGNALS = new Set(['style']);
const MIN_RECOMMENDATION_SCORE = 2;

interface EcosystemRecommendation {
  workerName: string;
  workerUrl: string;
  matchedSignals: string[];
  hasRecentActivity: boolean;
}

function normalizeForMatching(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasWordMatch(haystack: string, needle: string): boolean {
  return new RegExp(`(^|\\s)${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`).test(
    haystack,
  );
}

function scoreSignal(transcript: string, signal: string): number {
  const normalizedSignal = normalizeForMatching(signal);
  if (!normalizedSignal) {
    return 0;
  }

  if (normalizedSignal.includes(' ')) {
    return transcript.includes(normalizedSignal) ? 3 : 0;
  }

  if (!hasWordMatch(transcript, normalizedSignal)) {
    return 0;
  }

  return AMBIGUOUS_SINGLE_WORD_SIGNALS.has(normalizedSignal) ? 1 : 2;
}

function hasActivityForWorker(
  workerSlug: string,
  workerName: string,
  activity: UserEcosystemActivity | null | undefined,
): boolean {
  if (!activity) {
    return false;
  }

  const normalizedName = normalizeForMatching(workerName);
  return activity.workers.some((worker) => {
    const normalizedWorkerName = normalizeForMatching(worker.workerName);
    return worker.workerSlug === workerSlug || normalizedWorkerName === normalizedName;
  });
}

export function findEcosystemRecommendation(
  transcript: string,
  activity?: UserEcosystemActivity | null,
): EcosystemRecommendation | null {
  const normalizedTranscript = normalizeForMatching(transcript);
  if (!normalizedTranscript) {
    return null;
  }

  let best:
    | {
        score: number;
        matchedSignals: string[];
        workerName: string;
        workerUrl: string;
        hasRecentActivity: boolean;
      }
    | null = null;

  for (const worker of CHRYSTY_PROD_WORKERS) {
    const matchedSignals: string[] = [];
    let score = 0;

    for (const signal of worker.signals) {
      const signalScore = scoreSignal(normalizedTranscript, signal);
      if (signalScore > 0) {
        score += signalScore;
        matchedSignals.push(signal);
      }
    }

    const hasRecentActivity = hasActivityForWorker(worker.slug, worker.name, activity);
    if (hasRecentActivity && score > 0) {
      score += 1;
    }

    if (score >= MIN_RECOMMENDATION_SCORE && (!best || score > best.score)) {
      best = {
        score,
        matchedSignals,
        workerName: worker.name,
        workerUrl: worker.url,
        hasRecentActivity,
      };
    }
  }

  if (!best) {
    return null;
  }

  return {
    workerName: best.workerName,
    workerUrl: best.workerUrl,
    matchedSignals: best.matchedSignals.slice(0, 3),
    hasRecentActivity: best.hasRecentActivity,
  };
}

function buildCatalogSection(): string {
  const lines = ['Chrysty sister apps (specialized workers — recommend only when clearly relevant):'];

  for (const worker of CHRYSTY_PROD_WORKERS) {
    lines.push(
      `- ${worker.name} (${worker.url}): ${worker.summary} Signals: ${worker.signals.join(', ')}.`,
    );
  }

  return lines.join('\n');
}

function buildProfileRoutingHints(profile: CompanionProfile): string | null {
  const hints: string[] = [];

  if (profile.occupation) {
    hints.push(`occupation: ${profile.occupation}`);
  }
  if (profile.interests) {
    hints.push(`interests: ${profile.interests}`);
  }
  if (profile.healthNotes) {
    hints.push(`health context: ${profile.healthNotes}`);
  }
  if (profile.interactionPreferences?.expertiseLenses?.length) {
    hints.push(`preferred expertise lenses: ${profile.interactionPreferences.expertiseLenses.join(', ')}`);
  }
  if (profile.interactionPreferences?.customExpertise) {
    hints.push(`custom role preference: ${profile.interactionPreferences.customExpertise}`);
  }

  if (hints.length === 0) {
    return null;
  }

  return `Profile hints for routing: ${hints.join('; ')}.`;
}

function buildFocusedRecommendationBlock(
  transcript: string | undefined,
  activity: UserEcosystemActivity | null | undefined,
): string | null {
  const recommendation = transcript ? findEcosystemRecommendation(transcript, activity) : null;
  if (!recommendation) {
    return null;
  }

  const activityHint = recommendation.hasRecentActivity
    ? ' This also matches the user\'s recent Chrysty ecosystem activity.'
    : '';

  return [
    'Focused Chrysty ecosystem hint for this turn:',
    `- Best app match: ${recommendation.workerName} (${recommendation.workerUrl}).`,
    `- Matched current-request signals: ${recommendation.matchedSignals.join(', ')}.${activityHint}`,
    '- Answer the user first. Mention this app only if it genuinely improves the experience or gives them a better dedicated workspace.',
    '- Keep the mention brief in spoken_transcript with why it fits; put the URL only in explanation_text when a visual explanation is already useful.',
  ].join('\n');
}

export function buildChrystyEcosystemBlock(
  companionProfile?: CompanionProfile,
  transcript?: string,
  activity?: UserEcosystemActivity | null,
): string {
  const lines = [
    buildCatalogSection(),
    '',
    'Ecosystem routing (you are Chrysty at chrysty.chrysty.dev — a general voice and camera companion):',
    '- Sister apps are specialized; recommend one only when the user\'s need clearly fits better there than Astra.',
    '- Cross-check the companion profile (interests, occupation, health notes) with the current transcript before suggesting.',
    '- Suggest when: the user needs deep bookkeeping, outfit planning, structured learning paths, voice roleplay drills, long-form content creation, or repeated frustration that maps to a sister-app signal.',
    '- Do not suggest during: greetings, emotional support, quick factual Q&A, camera or visual tasks Astra already handles, or unrelated chat.',
    '- spoken_transcript: one brief mention with why it fits, no URLs (e.g. "For receipt tracking, our Ledger app is built for that.").',
    '- explanation_text (when needs_visual_explanation is true): app name, one-line why, and full URL as a markdown link.',
    '- At most one sister-app mention per turn unless the user explicitly asks about the Chrysty ecosystem.',
    '- Do not invent apps beyond the catalog above.',
  ];

  const profileHints = companionProfile ? buildProfileRoutingHints(companionProfile) : null;
  if (profileHints) {
    lines.push(`- ${profileHints}`);
  }

  const focusedRecommendation = buildFocusedRecommendationBlock(transcript, activity);
  if (focusedRecommendation) {
    lines.push('', focusedRecommendation);
  }

  return lines.join('\n');
}

export function buildUserEcosystemActivityBlock(
  summary: UserEcosystemActivity | null | undefined,
): string | null {
  if (!summary || summary.workers.length === 0) {
    return null;
  }

  const lines = [
    'User activity on other Chrysty apps (continuity hints — do not recite verbatim; use naturally):',
  ];

  for (const worker of summary.workers) {
    lines.push(`- ${worker.workerName}: ${worker.bullets.join('; ')}.`);
  }

  lines.push(
    'Rules: weave in only when relevant to the current turn; never expose private details, exact amounts, or full chat logs; prefer sister-app suggestions that match this history.',
  );

  return lines.join('\n');
}
