import { astraFetch } from '@/lib/astra/api-client';
import type { BackgroundJobClientItem } from '@/lib/background-jobs/types';

export interface BackgroundJobsListResponse {
  jobs: BackgroundJobClientItem[];
  enabled: boolean;
}

export async function fetchBackgroundJobs(): Promise<BackgroundJobsListResponse> {
  const response = await astraFetch('/api/astra/background-jobs');
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? 'Could not load background jobs');
  }
  return (await response.json()) as BackgroundJobsListResponse;
}

export async function cancelBackgroundJob(id: string): Promise<void> {
  const response = await astraFetch(`/api/astra/background-jobs/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? 'Could not cancel job');
  }
}

export async function markBackgroundJobsSeen(jobIds: string[]): Promise<void> {
  if (jobIds.length === 0) return;
  const response = await astraFetch('/api/astra/background-jobs', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seenJobIds: jobIds }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? 'Could not update jobs');
  }
}
