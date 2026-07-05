'use client';

import { useState } from 'react';
import {
  Ban,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDashed,
  FolderOpen,
  Loader2,
  XCircle,
} from 'lucide-react';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { BackgroundJobClientItem, JobProgressStep } from '@/lib/background-jobs/types';
import { ACTIVE_JOB_STATUSES } from '@/lib/background-jobs/types';
import { cn } from '@/lib/utils';

interface BackgroundJobsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobs: BackgroundJobClientItem[];
  onCancelJob: (id: string) => void;
  onViewDocuments: () => void;
}

function isActiveJob(job: BackgroundJobClientItem): boolean {
  return (ACTIVE_JOB_STATUSES as string[]).includes(job.status);
}

function StatusIcon({ job }: { job: BackgroundJobClientItem }) {
  if (isActiveJob(job)) {
    return <Loader2 className="size-4 shrink-0 animate-spin text-cyan-300" aria-hidden />;
  }
  if (job.status === 'completed') {
    return <CheckCircle2 className="size-4 shrink-0 text-emerald-300" aria-hidden />;
  }
  if (job.status === 'failed') {
    return <XCircle className="size-4 shrink-0 text-rose-300" aria-hidden />;
  }
  return <Ban className="size-4 shrink-0 text-slate-400" aria-hidden />;
}

function StepRow({ step }: { step: JobProgressStep }) {
  return (
    <li className="flex items-start gap-2 text-xs">
      {step.status === 'done' ? (
        <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-300" aria-hidden />
      ) : step.status === 'running' ? (
        <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-cyan-300" aria-hidden />
      ) : step.status === 'failed' ? (
        <XCircle className="mt-0.5 size-3.5 shrink-0 text-rose-300" aria-hidden />
      ) : (
        <CircleDashed className="mt-0.5 size-3.5 shrink-0 text-slate-500" aria-hidden />
      )}
      <span
        className={cn(
          'min-w-0 flex-1',
          step.status === 'done' ? 'text-slate-300' : 'text-slate-400',
          step.status === 'running' && 'text-cyan-100',
        )}
      >
        {step.title}
        {step.detail ? <span className="block text-[11px] text-slate-500">{step.detail}</span> : null}
      </span>
    </li>
  );
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function JobCard({
  job,
  onCancel,
  onViewDocuments,
}: {
  job: BackgroundJobClientItem;
  onCancel: (id: string) => void;
  onViewDocuments: () => void;
}) {
  const [expanded, setExpanded] = useState(isActiveJob(job));
  const active = isActiveJob(job);
  const hasSteps = job.steps.length > 0;

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-3">
      <div className="flex items-start gap-2.5">
        <StatusIcon job={job} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-cyan-50">{job.title}</p>
          <p className="mt-0.5 line-clamp-2 text-xs text-slate-400">
            {active
              ? job.activity ?? 'Working…'
              : job.status === 'completed'
                ? job.resultSummary ?? 'Finished — documents are in your workspace.'
                : job.status === 'failed'
                  ? job.error ?? 'The task failed.'
                  : 'Canceled.'}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            Started {formatTime(job.createdAt)}
            {job.completedAt ? ` · finished ${formatTime(job.completedAt)}` : ''}
            {job.documentIds.length > 0 ? ` · ${job.documentIds.length} document${job.documentIds.length === 1 ? '' : 's'}` : ''}
          </p>
        </div>
        {hasSteps ? (
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            className="rounded-full p-1 text-slate-400 transition-colors hover:bg-white/5 hover:text-cyan-100"
            aria-label={expanded ? 'Collapse steps' : 'Expand steps'}
          >
            {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </button>
        ) : null}
      </div>

      {expanded && hasSteps ? (
        <ul className="mt-3 flex flex-col gap-1.5 border-t border-white/5 pt-3">
          {job.steps.map((step) => (
            <StepRow key={step.id} step={step} />
          ))}
        </ul>
      ) : null}

      <div className="mt-3 flex items-center gap-2">
        {job.status === 'completed' && job.documentIds.length > 0 ? (
          <button
            type="button"
            onClick={onViewDocuments}
            className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/25 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-100 transition-colors hover:border-cyan-400/45 hover:bg-cyan-500/20"
          >
            <FolderOpen className="size-3.5" aria-hidden />
            View documents
          </button>
        ) : null}
        {active ? (
          <button
            type="button"
            onClick={() => onCancel(job.id)}
            className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/25 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-100 transition-colors hover:border-rose-400/45 hover:bg-rose-500/20"
          >
            <Ban className="size-3.5" aria-hidden />
            Cancel
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function BackgroundJobsSheet({
  open,
  onOpenChange,
  jobs,
  onCancelJob,
  onViewDocuments,
}: BackgroundJobsSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton
        className={cn(
          'max-h-[min(85dvh,34rem)] rounded-t-3xl border-white/10 bg-slate-950/95 text-cyan-50 backdrop-blur-md',
          'pb-[max(1rem,env(safe-area-inset-bottom))]',
        )}
      >
        <SheetHeader className="gap-3 px-1 pt-1">
          <SheetTitle className="text-cyan-50">Background tasks</SheetTitle>
          <SheetDescription className="text-slate-400">
            Work you delegated by voice — Chrysty keeps going even when you close the app.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-1 pb-2">
          {jobs.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">
              No background tasks yet. Try: &ldquo;Research my competitors and prepare a full report.&rdquo;
            </p>
          ) : (
            jobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                onCancel={onCancelJob}
                onViewDocuments={onViewDocuments}
              />
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
