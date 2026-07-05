'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { MAX_PENDING_PHOTOS } from '@/lib/camera/types';
import { cn } from '@/lib/utils';

export interface PhotoStripItem {
  id: string;
  url: string;
  annotationCount?: number;
}

interface PhotoStripProps {
  photos: PhotoStripItem[];
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  className?: string;
}

export function PhotoStrip({ photos, onSelect, onRemove, className }: PhotoStripProps) {
  if (photos.length === 0) {
    return null;
  }

  return (
    <div className={cn('flex w-full max-w-md flex-col items-center gap-2', className)}>
      <div className="flex w-full items-center justify-between px-1">
        <p className="text-xs font-medium tracking-wide text-cyan-200/80">Captured photos</p>
        <span className="rounded-full border border-cyan-400/25 bg-slate-950/60 px-2 py-0.5 text-xs tabular-nums text-cyan-100">
          {photos.length} / {MAX_PENDING_PHOTOS}
        </span>
      </div>

      <div className="flex w-full gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] scrollbar-none [&::-webkit-scrollbar]:hidden">
        <AnimatePresence mode="popLayout">
          {photos.map((photo) => (
            <motion.div
              key={photo.id}
              layout
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="relative shrink-0"
            >
              <button
                type="button"
                onClick={() => onSelect(photo.id)}
                className="relative block size-16 overflow-hidden rounded-xl border border-cyan-400/35 bg-slate-950/80 shadow-[0_0_18px_rgba(31,213,249,0.15)] transition-transform duration-150 hover:scale-[1.02] hover:border-cyan-300/50 sm:size-17"
                aria-label="Edit photo annotations"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.url}
                  alt="Captured photo preview"
                  className="size-full object-cover"
                />
                {photo.annotationCount ? (
                  <span className="absolute bottom-1 left-1 rounded-full border border-cyan-300/35 bg-slate-950/90 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-cyan-100">
                    {photo.annotationCount}
                  </span>
                ) : null}
              </button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={(event) => {
                  event.stopPropagation();
                  onRemove(photo.id);
                }}
                aria-label="Remove photo"
                className="absolute -right-1.5 -top-1.5 size-6 rounded-full border border-white/10 bg-slate-900/95 text-cyan-50 shadow-md hover:bg-slate-800"
              >
                <X className="size-3" />
              </Button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
