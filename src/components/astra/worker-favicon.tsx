'use client';

import { useState } from 'react';

import { cn } from '@/lib/utils';

function workerInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .slice(0, 2)
    .map((word) => word[0]!)
    .join('')
    .toUpperCase();
}

function workerIconCandidates(origin: string): string[] {
  return [
    `${origin}/icon`,
    `${origin}/icon.svg`,
    `${origin}/apple-icon`,
    `${origin}/apple-icon.svg`,
    `${origin}/apple-touch-icon.png`,
  ];
}

interface WorkerFaviconProps {
  name: string;
  url: string;
  className?: string;
}

export function WorkerFavicon({ name, url, className }: WorkerFaviconProps) {
  const origin = new URL(url).origin;
  const [srcIndex, setSrcIndex] = useState(0);
  const candidates = workerIconCandidates(origin);

  const failed = srcIndex >= candidates.length;
  const src = candidates[srcIndex];

  if (failed) {
    return (
      <span
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-cyan-500/30 via-cyan-600/15 to-slate-800/80 text-[11px] font-semibold tracking-tight text-cyan-50 shadow-inner ring-1 ring-white/15',
          className,
        )}
        aria-hidden
      >
        {workerInitials(name)}
      </span>
    );
  }

  return (
    <span
      className={cn(
        'relative flex size-10 shrink-0 overflow-hidden rounded-xl bg-slate-900/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ring-1 ring-white/12',
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        width={40}
        height={40}
        className="size-full object-cover"
        onError={() => setSrcIndex((index) => index + 1)}
      />
    </span>
  );
}
