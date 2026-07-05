'use client';

import type { ResponseTimings } from '@/lib/gemini/config';

interface LatencySlotProps {
  timings?: ResponseTimings | null;
}

function formatMs(value: number): string {
  return `${Math.round(value)} ms`;
}

export function LatencySlot({ timings = null }: LatencySlotProps) {
  if (!timings) {
    return null;
  }

  return (
    <section
      className="relative z-10 w-full max-w-md rounded-2xl border border-cyan-400/15 bg-slate-950/70 p-4 text-left shadow-lg backdrop-blur"
      data-latency-slot
    >
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300/70">Latency</p>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-xs text-cyan-100/80 sm:grid-cols-4">
        <div>
          <dt className="uppercase tracking-wide text-cyan-300/60">First audio</dt>
          <dd className="mt-1 font-medium text-slate-100">
            {timings.timeToFirstAudioMs != null ? formatMs(timings.timeToFirstAudioMs) : '—'}
          </dd>
        </div>
        <div>
          <dt className="uppercase tracking-wide text-cyan-300/60">STT</dt>
          <dd className="mt-1 font-medium text-slate-100">{formatMs(timings.sttMs)}</dd>
        </div>
        <div>
          <dt className="uppercase tracking-wide text-cyan-300/60">TTS</dt>
          <dd className="mt-1 font-medium text-slate-100">{formatMs(timings.ttsMs)}</dd>
        </div>
        <div>
          <dt className="uppercase tracking-wide text-cyan-300/60">Total</dt>
          <dd className="mt-1 font-medium text-slate-100">{formatMs(timings.totalMs)}</dd>
        </div>
      </dl>
    </section>
  );
}
