export type BackgroundJobStatus =
  | 'queued'
  | 'planning'
  | 'running'
  | 'completed'
  | 'failed'
  | 'canceled';

export const ACTIVE_JOB_STATUSES: BackgroundJobStatus[] = ['queued', 'planning', 'running'];

export interface JobPlanStep {
  id: string;
  title: string;
  /** Free-form specialist role the manager invented for this step, e.g. "market researcher". */
  role: string;
  instructions: string;
}

export interface JobPlan {
  approach: string;
  steps: JobPlanStep[];
}

export interface JobStepNote {
  stepId: string;
  title: string;
  summary: string;
}

export interface JobWorkingState {
  nextStepIndex?: number;
  notes?: JobStepNote[];
  /** Per-step attempt counts so timed-out steps are retried at most once. */
  attempts?: Record<string, number>;
}

export type JobProgressStepStatus = 'pending' | 'running' | 'done' | 'failed';

export interface JobProgressStep {
  id: string;
  title: string;
  status: JobProgressStepStatus;
  detail?: string;
}

export interface JobLogEntry {
  at: string;
  text: string;
}

export interface JobProgress {
  activity?: string;
  steps?: JobProgressStep[];
  log?: JobLogEntry[];
}

export interface AstraBackgroundJobRow {
  id: string;
  workspace_id: string;
  astra_key: string;
  user_id: string | null;
  title: string;
  objective: string;
  artifact_language: string;
  status: BackgroundJobStatus;
  plan: JobPlan | null;
  working_state: JobWorkingState;
  progress: JobProgress;
  error: string | null;
  result_summary: string | null;
  document_ids: string[];
  origin: string | null;
  leg_count: number;
  heartbeat_at: string | null;
  seen_at: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

/** Shape returned to the client. */
export interface BackgroundJobClientItem {
  id: string;
  title: string;
  objective: string;
  artifactLanguage: string;
  status: BackgroundJobStatus;
  activity: string | null;
  steps: JobProgressStep[];
  log: JobLogEntry[];
  error: string | null;
  resultSummary: string | null;
  documentIds: string[];
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  seenAt: number | null;
}

export function toBackgroundJobClientItem(row: AstraBackgroundJobRow): BackgroundJobClientItem {
  return {
    id: row.id,
    title: row.title,
    objective: row.objective,
    artifactLanguage: row.artifact_language || 'en',
    status: row.status,
    activity: row.progress?.activity ?? null,
    steps: row.progress?.steps ?? [],
    log: row.progress?.log ?? [],
    error: row.error,
    resultSummary: row.result_summary,
    documentIds: row.document_ids ?? [],
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
    completedAt: row.completed_at ? new Date(row.completed_at).getTime() : null,
    seenAt: row.seen_at ? new Date(row.seen_at).getTime() : null,
  };
}
