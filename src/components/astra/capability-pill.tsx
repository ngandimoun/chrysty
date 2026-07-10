'use client';

import { BellRing, Clock3 } from 'lucide-react';

import type { ScheduledCapability } from '@/lib/capabilities/types';

export function CapabilityPill({
  capability,
  now,
  onOpen,
}: {
  capability: ScheduledCapability | null;
  now: number;
  onOpen: () => void;
}) {
  if (!capability) return null;
  const remaining = Math.max(0, Date.parse(capability.fireAt) - now);
  const due = capability.status === 'due' || remaining === 0;
  const totalSeconds = Math.ceil(remaining / 1000);
  const time =
    totalSeconds < 60
      ? `${totalSeconds}s`
      : totalSeconds < 3600
        ? `${Math.ceil(totalSeconds / 60)}m`
        : new Date(capability.fireAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex max-w-[min(92vw,26rem)] items-center gap-2.5 rounded-full border border-cyan-400/25 bg-slate-950/70 px-4 py-2 text-left shadow-[0_8px_28px_rgba(31,213,249,0.14)] backdrop-blur-md hover:border-cyan-400/45"
      aria-label={`Scheduled items: ${capability.title}`}
    >
      {due ? (
        <BellRing className="size-4 shrink-0 text-amber-300" aria-hidden />
      ) : (
        <Clock3 className="size-4 shrink-0 text-cyan-300" aria-hidden />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold text-cyan-50">{capability.title}</span>
        <span className="block text-[11px] text-cyan-200/70">{due ? 'Due now' : `In ${time}`}</span>
      </span>
    </button>
  );
}
