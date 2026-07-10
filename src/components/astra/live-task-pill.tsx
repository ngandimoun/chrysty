'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, Loader2 } from 'lucide-react';

import type { LiveDelegationStage } from '@/lib/live/types';

const STAGE_LABELS: Record<LiveDelegationStage, string> = {
  queued: 'Chrysty is getting started',
  analyzing: 'Chrysty is understanding your request',
  using_search: 'Chrysty is checking current information',
  using_maps: 'Chrysty is checking places',
  reading_source: 'Chrysty is reading the source',
  using_custom_tool: 'Chrysty is working through the details',
  running_code: 'Chrysty is preparing the calculation',
  preparing_visuals: 'Chrysty is preparing the visual explanation',
  completed: 'Chrysty finished',
  failed: 'Chrysty could not finish this task',
};

interface LiveTaskPillProps {
  delegation: {
    turnId: string;
    stage: LiveDelegationStage;
    errorCode?: string;
  } | null;
}

export function LiveTaskPill({ delegation }: LiveTaskPillProps) {
  const visible = delegation && delegation.stage !== 'completed';
  const failed = delegation?.stage === 'failed';

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          key={delegation.turnId}
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: 8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.96 }}
          className="flex max-w-[min(92vw,26rem)] items-center gap-2.5 rounded-full border border-cyan-400/25 bg-slate-950/70 px-4 py-2 shadow-[0_8px_28px_rgba(31,213,249,0.14)] backdrop-blur-md"
        >
          {failed ? (
            <AlertCircle className="size-4 shrink-0 text-amber-300" aria-hidden />
          ) : (
            <Loader2 className="size-4 shrink-0 animate-spin text-cyan-300" aria-hidden />
          )}
          <span className="min-w-0">
            <span className="block truncate text-xs font-semibold text-cyan-50">
              {STAGE_LABELS[delegation.stage]}
            </span>
            {failed && delegation.errorCode ? (
              <span className="block truncate text-[10px] text-cyan-200/60">
                Reference: {delegation.errorCode}
              </span>
            ) : null}
          </span>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
