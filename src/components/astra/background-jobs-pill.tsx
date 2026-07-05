'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Loader2 } from 'lucide-react';

import type { BackgroundJobClientItem } from '@/lib/background-jobs/types';

interface BackgroundJobsPillProps {
  activeJobs: BackgroundJobClientItem[];
  unseenCompletedCount: number;
  onOpen: () => void;
}

export function BackgroundJobsPill({
  activeJobs,
  unseenCompletedCount,
  onOpen,
}: BackgroundJobsPillProps) {
  const visible = activeJobs.length > 0 || unseenCompletedCount > 0;
  const primary = activeJobs[0];

  return (
    <AnimatePresence>
      {visible ? (
        <motion.button
          type="button"
          key="background-jobs-pill"
          initial={{ opacity: 0, y: 8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.96 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          onClick={onOpen}
          className="pointer-events-auto flex max-w-[min(92vw,26rem)] items-center gap-2.5 rounded-full border border-cyan-400/25 bg-slate-950/70 px-4 py-2 text-left shadow-[0_8px_28px_rgba(31,213,249,0.14)] backdrop-blur-md transition-colors hover:border-cyan-400/45 hover:bg-cyan-500/10"
          aria-label="Background tasks"
        >
          {activeJobs.length > 0 ? (
            <Loader2 className="size-4 shrink-0 animate-spin text-cyan-300" aria-hidden />
          ) : (
            <CheckCircle2 className="size-4 shrink-0 text-emerald-300" aria-hidden />
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold text-cyan-50">
              {activeJobs.length > 0
                ? activeJobs.length === 1
                  ? primary?.title ?? 'Working on your task'
                  : `${activeJobs.length} tasks in progress`
                : `${unseenCompletedCount} task${unseenCompletedCount === 1 ? '' : 's'} finished`}
            </span>
            {activeJobs.length > 0 && primary?.activity ? (
              <span className="block truncate text-[11px] text-cyan-200/70">{primary.activity}</span>
            ) : null}
          </span>
          {unseenCompletedCount > 0 && activeJobs.length > 0 ? (
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-400/90 text-[10px] font-bold text-slate-950">
              {unseenCompletedCount}
            </span>
          ) : null}
        </motion.button>
      ) : null}
    </AnimatePresence>
  );
}
