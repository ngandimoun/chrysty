import {
  CHRYSTY_PROD_WORKERS,
  EXCLUDED_ACTIVITY_SLUGS,
  getPlatformSlug,
  getWorkerByPlatformSlug,
  resolveDisplaySlug,
} from '@/lib/astra/chrysty-workers';
import { createAdminClient, isSupabaseConfigured } from '@/lib/supabase/admin';

const MAX_WORKERS = 3;
const MAX_BULLETS_PER_WORKER = 3;
const MAX_TITLE_LENGTH = 60;
const CACHE_TTL_MS = 60_000;

export type WorkerActivitySummary = {
  workerSlug: string;
  workerName: string;
  bullets: string[];
  lastActivityAt: string;
};

export type UserEcosystemActivity = {
  workers: WorkerActivitySummary[];
};

type WorkerAccumulator = {
  platformSlug: string;
  workspaceNames: string[];
  conversationTitles: string[];
  usageActionCounts: Map<string, number>;
  learningSessions: LearningSessionRow[];
  lastActivityAt: string | null;
};

type WorkspaceRow = {
  worker_slug: string;
  name: string;
  updated_at: string;
};

type ConversationRow = {
  worker_slug: string;
  title: string | null;
  updated_at: string;
};

type UsageRow = {
  worker_slug: string;
  action_type: string;
  created_at: string;
};

type LearningSessionRow = {
  title: string;
  type: string;
  current_topic: string;
  progress: number;
  updated_at: string;
  worker_slug: string;
};

const activityCache = new Map<string, { expiresAt: number; data: UserEcosystemActivity | null }>();

function getPlatformSlugs(): string[] {
  return CHRYSTY_PROD_WORKERS.map((worker) => getPlatformSlug(worker));
}

function isExcludedPlatformSlug(platformSlug: string): boolean {
  return (EXCLUDED_ACTIVITY_SLUGS as readonly string[]).includes(platformSlug);
}

function truncateText(value: string, maxLength = MAX_TITLE_LENGTH): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLength - 1)}…`;
}

export function redactText(value: string): string {
  return value
    .replace(/\$[\d,]+(?:\.\d{1,2})?/g, '[amount]')
    .replace(/€[\d,]+(?:\.\d{1,2})?/g, '[amount]')
    .replace(/£[\d,]+(?:\.\d{1,2})?/g, '[amount]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[account]')
    .trim();
}

function formatRelativeTime(isoDate: string): string {
  const timestamp = Date.parse(isoDate);
  if (!Number.isFinite(timestamp)) {
    return 'recently';
  }

  const diffMs = Date.now() - timestamp;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) {
    return 'just now';
  }
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }

  const days = Math.floor(hours / 24);
  if (days < 14) {
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }

  const weeks = Math.floor(days / 7);
  return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
}

function touchActivity(accumulator: WorkerAccumulator, isoDate: string | null | undefined) {
  if (!isoDate) {
    return;
  }

  if (!accumulator.lastActivityAt || isoDate > accumulator.lastActivityAt) {
    accumulator.lastActivityAt = isoDate;
  }
}

function getOrCreateAccumulator(
  accumulators: Map<string, WorkerAccumulator>,
  platformSlug: string,
): WorkerAccumulator | null {
  if (isExcludedPlatformSlug(platformSlug)) {
    return null;
  }

  const existing = accumulators.get(platformSlug);
  if (existing) {
    return existing;
  }

  const created: WorkerAccumulator = {
    platformSlug,
    workspaceNames: [],
    conversationTitles: [],
    usageActionCounts: new Map(),
    learningSessions: [],
    lastActivityAt: null,
  };

  accumulators.set(platformSlug, created);
  return created;
}

function summarizeUsageActions(actionCounts: Map<string, number>): string | null {
  if (actionCounts.size === 0) {
    return null;
  }

  const topActions = [...actionCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 2)
    .map(([action]) => action.replace(/_/g, ' '));

  return `Recent activity: ${topActions.join(', ')}`;
}

function buildWorkerBullets(accumulator: WorkerAccumulator): string[] {
  const bullets: string[] = [];

  if (accumulator.workspaceNames.length > 0) {
    const names = [...new Set(accumulator.workspaceNames)].slice(0, 2);
    bullets.push(`Active workspace${names.length > 1 ? 's' : ''}: ${names.map((name) => `"${name}"`).join(', ')}`);
  }

  if (accumulator.conversationTitles.length > 0) {
    const titles = accumulator.conversationTitles.slice(0, 2).map((title) => `"${title}"`);
    bullets.push(`Recent chats: ${titles.join(', ')}`);
  }

  for (const session of accumulator.learningSessions.slice(0, 2)) {
    const title = redactText(truncateText(session.title));
    const topic = redactText(truncateText(session.current_topic, 40));
    bullets.push(
      `Session "${title}" (${session.type} mode, ~${session.progress}%, topic: ${topic})`,
    );
  }

  const usageSummary = summarizeUsageActions(accumulator.usageActionCounts);
  if (usageSummary) {
    bullets.push(usageSummary);
  }

  if (accumulator.lastActivityAt) {
    bullets.push(`Last used ${formatRelativeTime(accumulator.lastActivityAt)}`);
  }

  return bullets.slice(0, MAX_BULLETS_PER_WORKER).map((bullet) => redactText(truncateText(bullet, 120)));
}

export function summarizeWorkerAccumulators(
  accumulators: Map<string, WorkerAccumulator>,
): UserEcosystemActivity | null {
  const workers: WorkerActivitySummary[] = [];

  for (const accumulator of accumulators.values()) {
    const displaySlug = resolveDisplaySlug(accumulator.platformSlug);
    if (!displaySlug || !accumulator.lastActivityAt) {
      continue;
    }

    const bullets = buildWorkerBullets(accumulator);
    if (bullets.length === 0) {
      continue;
    }

    const worker = getWorkerByPlatformSlug(accumulator.platformSlug);
    workers.push({
      workerSlug: displaySlug,
      workerName: worker?.name ?? displaySlug,
      bullets,
      lastActivityAt: accumulator.lastActivityAt,
    });
  }

  if (workers.length === 0) {
    return null;
  }

  workers.sort((left, right) => right.lastActivityAt.localeCompare(left.lastActivityAt));

  return {
    workers: workers.slice(0, MAX_WORKERS),
  };
}

async function fetchPlatformActivity(userId: string) {
  const admin = createAdminClient();
  const platformSlugs = getPlatformSlugs();

  const [workspacesResult, conversationsResult, usageResult] = await Promise.all([
    admin
      .from('worker_workspaces')
      .select('worker_slug, name, updated_at')
      .eq('user_id', userId)
      .in('worker_slug', platformSlugs)
      .order('updated_at', { ascending: false })
      .limit(30),
    admin
      .from('worker_conversations')
      .select('worker_slug, title, updated_at')
      .eq('user_id', userId)
      .in('worker_slug', platformSlugs)
      .order('updated_at', { ascending: false })
      .limit(30),
    admin
      .from('usage_events')
      .select('worker_slug, action_type, created_at')
      .eq('user_id', userId)
      .in('worker_slug', platformSlugs)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  return {
    workspaces: (workspacesResult.data ?? []) as WorkspaceRow[],
    conversations: (conversationsResult.data ?? []) as ConversationRow[],
    usage: (usageResult.data ?? []) as UsageRow[],
    hadErrors: Boolean(
      workspacesResult.error || conversationsResult.error || usageResult.error,
    ),
  };
}

async function fetchLearningSessions(userId: string): Promise<LearningSessionRow[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('learning_sessions')
      .select('title, type, current_topic, progress, updated_at, worker_slug')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(5);

    if (error) {
      return [];
    }

    return (data ?? []) as LearningSessionRow[];
  } catch {
    return [];
  }
}

function mergePlatformRows(
  accumulators: Map<string, WorkerAccumulator>,
  rows: {
    workspaces: WorkspaceRow[];
    conversations: ConversationRow[];
    usage: UsageRow[];
  },
) {
  for (const workspace of rows.workspaces) {
    const accumulator = getOrCreateAccumulator(accumulators, workspace.worker_slug);
    if (!accumulator) {
      continue;
    }

    const name = redactText(truncateText(workspace.name));
    if (name) {
      accumulator.workspaceNames.push(name);
    }
    touchActivity(accumulator, workspace.updated_at);
  }

  for (const conversation of rows.conversations) {
    const accumulator = getOrCreateAccumulator(accumulators, conversation.worker_slug);
    if (!accumulator) {
      continue;
    }

    const title = redactText(truncateText(conversation.title ?? 'Untitled chat'));
    if (title && !accumulator.conversationTitles.includes(title)) {
      accumulator.conversationTitles.push(title);
    }
    touchActivity(accumulator, conversation.updated_at);
  }

  for (const usage of rows.usage) {
    const accumulator = getOrCreateAccumulator(accumulators, usage.worker_slug);
    if (!accumulator) {
      continue;
    }

    const current = accumulator.usageActionCounts.get(usage.action_type) ?? 0;
    accumulator.usageActionCounts.set(usage.action_type, current + 1);
    touchActivity(accumulator, usage.created_at);
  }
}

function mergeLearningSessions(
  accumulators: Map<string, WorkerAccumulator>,
  sessions: LearningSessionRow[],
) {
  for (const session of sessions) {
    const accumulator = getOrCreateAccumulator(accumulators, session.worker_slug || 'tutor');
    if (!accumulator) {
      continue;
    }

    accumulator.learningSessions.push(session);
    touchActivity(accumulator, session.updated_at);
  }
}

async function loadUserEcosystemActivity(userId: string): Promise<UserEcosystemActivity | null> {
  const accumulators = new Map<string, WorkerAccumulator>();

  const [platformRows, learningSessions] = await Promise.all([
    fetchPlatformActivity(userId),
    fetchLearningSessions(userId),
  ]);

  if (platformRows.hadErrors && learningSessions.length === 0) {
    return null;
  }

  mergePlatformRows(accumulators, platformRows);
  mergeLearningSessions(accumulators, learningSessions);

  return summarizeWorkerAccumulators(accumulators);
}

export async function fetchUserEcosystemActivity(
  userId: string,
): Promise<UserEcosystemActivity | null> {
  if (!userId || !isSupabaseConfigured()) {
    return null;
  }

  const cached = activityCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  try {
    const data = await loadUserEcosystemActivity(userId);
    activityCache.set(userId, { expiresAt: Date.now() + CACHE_TTL_MS, data });
    return data;
  } catch {
    activityCache.set(userId, { expiresAt: Date.now() + CACHE_TTL_MS, data: null });
    return null;
  }
}

export function clearEcosystemActivityCache(userId?: string) {
  if (userId) {
    activityCache.delete(userId);
    return;
  }

  activityCache.clear();
}
