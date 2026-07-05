'use client';

import { cn } from '@/lib/utils';

interface CameraGridOverlayProps {
  visible: boolean;
  className?: string;
}

export function CameraGridOverlay({ visible, className }: CameraGridOverlayProps) {
  if (!visible) return null;

  return (
    <svg
      className={cn('pointer-events-none absolute inset-0 z-[5] size-full', className)}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
    >
      <line x1="33.33" y1="0" x2="33.33" y2="100" stroke="rgba(255,255,255,0.35)" strokeWidth="0.15" />
      <line x1="66.66" y1="0" x2="66.66" y2="100" stroke="rgba(255,255,255,0.35)" strokeWidth="0.15" />
      <line x1="0" y1="33.33" x2="100" y2="33.33" stroke="rgba(255,255,255,0.35)" strokeWidth="0.15" />
      <line x1="0" y1="66.66" x2="100" y2="66.66" stroke="rgba(255,255,255,0.35)" strokeWidth="0.15" />
    </svg>
  );
}
