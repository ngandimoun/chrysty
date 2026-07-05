'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { isRemotePersistenceEnabled } from '@/lib/astra/api-client';
import { ASTRA_KEY_CHANGED_EVENT } from '@/lib/astra/constants';
import {
  cancelBackgroundJob,
  fetchBackgroundJobs,
  markBackgroundJobsSeen,
} from '@/lib/astra/background-jobs-client';
import { ACTIVE_JOB_STATUSES, type BackgroundJobClientItem } from '@/lib/background-jobs/types';

const ACTIVE_POLL_MS = 5_000;
const IDLE_POLL_MS = 30_000;

export interface UseBackgroundJobsOptions {
  /** Called once per job when it transitions to completed while the app is open. */
  onJobCompleted?: (job: BackgroundJobClientItem) => void;
}

export interface UseBackgroundJobsResult {
  jobs: BackgroundJobClientItem[];
  activeJobs: BackgroundJobClientItem[];
  unseenCompleted: BackgroundJobClientItem[];
  enabled: boolean;
  isLoading: boolean;
  refresh: () => Promise<void>;
  cancelJob: (id: string) => Promise<void>;
  markCompletedSeen: () => Promise<void>;
}

function isActive(job: BackgroundJobClientItem): boolean {
  return (ACTIVE_JOB_STATUSES as string[]).includes(job.status);
}

export function useBackgroundJobs(options?: UseBackgroundJobsOptions): UseBackgroundJobsResult {
  const remoteEnabled = isRemotePersistenceEnabled();
  const [jobs, setJobs] = useState<BackgroundJobClientItem[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(remoteEnabled);

  const knownActiveIdsRef = useRef<Set<string>>(new Set());
  const onJobCompletedRef = useRef(options?.onJobCompleted);
  useEffect(() => {
    onJobCompletedRef.current = options?.onJobCompleted;
  });

  const applyJobs = useCallback((next: BackgroundJobClientItem[]) => {
    const previousActive = knownActiveIdsRef.current;
    for (const job of next) {
      if (job.status === 'completed' && previousActive.has(job.id)) {
        onJobCompletedRef.current?.(job);
      }
    }
    knownActiveIdsRef.current = new Set(next.filter(isActive).map((job) => job.id));
    setJobs(next);
  }, []);

  const refresh = useCallback(async () => {
    if (!remoteEnabled) return;
    try {
      const data = await fetchBackgroundJobs();
      setEnabled(data.enabled);
      applyJobs(data.jobs);
    } catch {
      // Keep the previous snapshot on transient failures.
    }
  }, [applyJobs, remoteEnabled]);

  useEffect(() => {
    if (!remoteEnabled) return;

    let cancelled = false;
    let timer: number | undefined;

    const tick = async () => {
      await refresh();
      if (cancelled) return;
      setIsLoading(false);
      const delay = knownActiveIdsRef.current.size > 0 ? ACTIVE_POLL_MS : IDLE_POLL_MS;
      timer = window.setTimeout(() => void tick(), delay);
    };

    void tick();

    const onKeyChanged = () => {
      void refresh();
    };
    window.addEventListener(ASTRA_KEY_CHANGED_EVENT, onKeyChanged);

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      window.removeEventListener(ASTRA_KEY_CHANGED_EVENT, onKeyChanged);
    };
  }, [refresh, remoteEnabled]);

  const cancelJob = useCallback(
    async (id: string) => {
      await cancelBackgroundJob(id);
      await refresh();
    },
    [refresh],
  );

  const unseenCompleted = jobs.filter((job) => job.status === 'completed' && !job.seenAt);

  const markCompletedSeen = useCallback(async () => {
    const ids = jobs
      .filter((job) => (job.status === 'completed' || job.status === 'failed') && !job.seenAt)
      .map((job) => job.id);
    if (ids.length === 0) return;

    const seenAt = Date.now();
    setJobs((current) =>
      current.map((job) => (ids.includes(job.id) ? { ...job, seenAt } : job)),
    );

    try {
      await markBackgroundJobsSeen(ids);
    } catch {
      // Non-fatal; will re-sync on the next poll.
    }
  }, [jobs]);

  return {
    jobs,
    activeJobs: jobs.filter(isActive),
    unseenCompleted,
    enabled,
    isLoading,
    refresh,
    cancelJob,
    markCompletedSeen,
  };
}
