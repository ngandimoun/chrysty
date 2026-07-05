'use client';

import { ImageIcon } from 'lucide-react';

import type { CodeExecutionImage } from '@/lib/charts/types';

interface CodeExecutionImageProps {
  image: CodeExecutionImage;
  index: number;
}

export function CodeExecutionImageView({ image, index }: CodeExecutionImageProps) {
  const src = `data:${image.mimeType};base64,${image.data}`;

  return (
    <figure className="rounded-xl border border-cyan-400/15 bg-slate-900/60 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm text-slate-300">
        <ImageIcon className="size-4 text-cyan-300/80" aria-hidden="true" />
        <figcaption>
          {image.caption ?? 'Computed visualization'}
          {index > 0 ? ` (${index + 1})` : ''}
        </figcaption>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={image.caption ?? 'Computed visualization from code execution'}
        className="mx-auto max-h-72 w-full rounded-lg object-contain"
      />
    </figure>
  );
}
