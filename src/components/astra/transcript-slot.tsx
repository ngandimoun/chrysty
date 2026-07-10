'use client';

import type { TranscriptionTimings } from '@/lib/gemini/config';
import type { TranscriptChunk } from '@/lib/streaming/types';

interface TranscriptSlotProps {
  chunks?: TranscriptChunk[];
  timings?: TranscriptionTimings | null;
}

function formatMs(value: number): string {
  return `${Math.round(value)} ms`;
}

export function TranscriptSlot({ chunks = [], timings = null }: TranscriptSlotProps) {
  const latestChunk = chunks.at(-1);
  const latest = latestChunk?.text ?? '';
  const isStreaming = latestChunk?.isFinal === false;
  const speaker =
    latestChunk?.role === 'user'
      ? 'You'
      : latestChunk?.role === 'assistant'
        ? 'Chrysty'
        : 'Transcript';

  if (!latest && !timings) {
    return null;
  }

  return (
    <section
      className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card p-4 text-left shadow-sm"
      aria-live="polite"
      aria-atomic="true"
      data-transcript-slot
      data-chunks={chunks.length}
    >
      {latest ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {speaker}
            {isStreaming ? ' (listening…)' : ''}
          </p>
          <p className="mt-2 text-sm leading-6 text-foreground">{latest}</p>
        </div>
      ) : null}

      {timings ? (
        <dl className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
          <div>
            <dt className="uppercase tracking-wide text-muted-foreground">Recording</dt>
            <dd className="mt-1 font-medium text-foreground">{formatMs(timings.audioDurationMs)}</dd>
          </div>
          <div>
            <dt className="uppercase tracking-wide text-muted-foreground">First token</dt>
            <dd className="mt-1 font-medium text-foreground">
              {timings.timeToFirstTokenMs != null ? formatMs(timings.timeToFirstTokenMs) : '—'}
            </dd>
          </div>
          <div>
            <dt className="uppercase tracking-wide text-muted-foreground">API</dt>
            <dd className="mt-1 font-medium text-foreground">{formatMs(timings.apiMs)}</dd>
          </div>
          <div>
            <dt className="uppercase tracking-wide text-muted-foreground">Total</dt>
            <dd className="mt-1 font-medium text-foreground">{formatMs(timings.totalMs)}</dd>
          </div>
        </dl>
      ) : null}
    </section>
  );
}
