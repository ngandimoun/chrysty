'use client';

import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';

interface FocusReticlePoint {
  id: string;
  x: number;
  y: number;
}

interface CameraFocusReticleProps {
  point: { x: number; y: number } | null;
  className?: string;
}

export function CameraFocusReticle({ point, className }: CameraFocusReticleProps) {
  const [reticle, setReticle] = useState<FocusReticlePoint | null>(null);

  useEffect(() => {
    if (!point) return;

    const id = `${point.x}-${point.y}-${Date.now()}`;
    setReticle({ id, x: point.x, y: point.y });

    const timeout = window.setTimeout(() => {
      setReticle((current) => (current?.id === id ? null : current));
    }, 1500);

    return () => window.clearTimeout(timeout);
  }, [point]);

  if (!reticle) return null;

  return (
    <div className={cn('pointer-events-none absolute inset-0 z-[6]', className)} aria-hidden>
      <div
        className="absolute size-16 -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-sm border-2 border-cyan-300/90 shadow-[0_0_16px_rgba(31,213,249,0.45)]"
        style={{
          left: `${reticle.x * 100}%`,
          top: `${reticle.y * 100}%`,
        }}
      />
    </div>
  );
}
