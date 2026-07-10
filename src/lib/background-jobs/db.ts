import { createUntypedAdminClient } from '@/lib/supabase/admin';
import type {
  AstraBackgroundJobRow,
  BackgroundJobStatus,
  JobLogEntry,
  JobPlan,
  JobProgress,
  JobWorkingState,
} from './types';
import { ACTIVE_JOB_STATUSES } from './types';
import { normalizeBcp47 } from '@/lib/language/language-resolution';

const TABLE = 'astra_background_jobs';
const MAX_LOG_ENTRIES = 50;

export async function createBackgroundJob(params: {
  workspaceId: string;
  astraKey: string;
  userId?: string;
  title: string;
  objective: string;
  origin: string;
  artifactLanguage?: string;
}): Promise<AstraBackgroundJobRow> {
  const { data, error } = await createUntypedAdminClient()
    .from(TABLE)
    .insert({
      workspace_id: params.workspaceId,
      astra_key: params.astraKey,
      user_id: params.userId ?? null,
      title: params.title,
      objective: params.objective,
      artifact_language: normalizeBcp47(params.artifactLanguage) ?? 'en',
      status: 'queued',
      origin: params.origin,
      progress: { activity: 'Queued — waiting for a worker to pick this up', steps: [], log: [] },
      working_state: {},
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as AstraBackgroundJobRow;
}

export async function getBackgroundJob(jobId: string): Promise<AstraBackgroundJobRow | null> {
  const { data, error } = await createUntypedAdminClient()
    .from(TABLE)
    .select('*')
    .eq('id', jobId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as AstraBackgroundJobRow | null) ?? null;
}

export async function getBackgroundJobForKey(
  astraKey: string,
  jobId: string,
): Promise<AstraBackgroundJobRow | null> {
  const { data, error } = await createUntypedAdminClient()
    .from(TABLE)
    .select('*')
    .eq('astra_key', astraKey)
    .eq('id', jobId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as AstraBackgroundJobRow | null) ?? null;
}

export async function listBackgroundJobs(
  astraKey: string,
  limit = 30,
): Promise<AstraBackgroundJobRow[]> {
  const { data, error } = await createUntypedAdminClient()
    .from(TABLE)
    .select('*')
    .eq('astra_key', astraKey)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as AstraBackgroundJobRow[];
}

export async function listActiveBackgroundJobs(astraKey: string): Promise<AstraBackgroundJobRow[]> {
  const { data, error } = await createUntypedAdminClient()
    .from(TABLE)
    .select('*')
    .eq('astra_key', astraKey)
    .in('status', ACTIVE_JOB_STATUSES)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as AstraBackgroundJobRow[];
}

export async function updateBackgroundJob(
  jobId: string,
  patch: Partial<{
    status: BackgroundJobStatus;
    title: string;
    plan: JobPlan;
    working_state: JobWorkingState;
    progress: JobProgress;
    error: string | null;
    result_summary: string | null;
    document_ids: string[];
    leg_count: number;
    heartbeat_at: string;
    completed_at: string | null;
    seen_at: string | null;
  }>,
): Promise<AstraBackgroundJobRow> {
  const { data, error } = await createUntypedAdminClient()
    .from(TABLE)
    .update(patch)
    .eq('id', jobId)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as AstraBackgroundJobRow;
}

export function appendJobLog(progress: JobProgress, text: string): JobProgress {
  const entry: JobLogEntry = { at: new Date().toISOString(), text };
  const log = [...(progress.log ?? []), entry].slice(-MAX_LOG_ENTRIES);
  return { ...progress, log };
}

export async function markBackgroundJobsSeen(astraKey: string, jobIds: string[]): Promise<void> {
  if (jobIds.length === 0) return;
  const { error } = await createUntypedAdminClient()
    .from(TABLE)
    .update({ seen_at: new Date().toISOString() })
    .eq('astra_key', astraKey)
    .in('id', jobIds);

  if (error) throw new Error(error.message);
}

export async function requestBackgroundJobCancel(
  astraKey: string,
  jobId: string,
): Promise<AstraBackgroundJobRow | null> {
  const { data, error } = await createUntypedAdminClient()
    .from(TABLE)
    .update({
      status: 'canceled',
      completed_at: new Date().toISOString(),
      progress: { activity: 'Canceled by user', steps: [], log: [] },
    })
    .eq('astra_key', astraKey)
    .eq('id', jobId)
    .in('status', ACTIVE_JOB_STATUSES)
    .select('*')
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as AstraBackgroundJobRow | null) ?? null;
}

/** Jobs that look abandoned mid-run (leg died without chaining). */
export function isJobStalled(row: AstraBackgroundJobRow, staleAfterMs = 120_000): boolean {
  if (!ACTIVE_JOB_STATUSES.includes(row.status)) return false;
  const reference = row.heartbeat_at ?? row.created_at;
  return Date.now() - new Date(reference).getTime() > staleAfterMs;
}

export async function listJobDocuments(
  astraKey: string,
  jobId: string,
): Promise<Array<{
  id: string;
  kind: string;
  title: string;
  created_at: string;
  updated_at: string;
  revision: number;
}>> {
  const { data, error } = await createUntypedAdminClient()
    .from('astra_generated_documents')
    .select('id, kind, title, created_at, updated_at, revision')
    .eq('astra_key', astraKey)
    .eq('job_id', jobId)
    .order('updated_at', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{
    id: string;
    kind: string;
    title: string;
    created_at: string;
    updated_at: string;
    revision: number;
  }>;
}
