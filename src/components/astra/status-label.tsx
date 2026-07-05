'use client';

import { AnimatePresence, motion } from 'framer-motion';

import type { AppAgentPhase } from '@/lib/agent-state';
import { STATUS_LABELS } from '@/lib/agent-state';

interface StatusLabelProps {
  phase: AppAgentPhase;
}

export function StatusLabel({ phase }: StatusLabelProps) {
  const label = STATUS_LABELS[phase];

  if (!label) {
    return null;
  }

  return (
    <div className="pointer-events-none relative h-8 w-full max-w-xs">
      <AnimatePresence mode="wait">
        <motion.p
          key={phase}
          initial={false}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="absolute inset-0 text-center text-sm font-medium tracking-wide text-muted-foreground"
        >
          {label}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}
