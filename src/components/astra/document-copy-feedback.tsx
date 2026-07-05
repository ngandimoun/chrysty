'use client';

import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';

interface DocumentCopyFeedbackProps {
  copied: boolean;
  className?: string;
}

export function DocumentCopyFeedback({ copied, className }: DocumentCopyFeedbackProps) {
  const [visible, setVisible] = useState(copied);

  useEffect(() => {
    if (!copied) return;
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  if (!visible) return null;

  return (
    <span
      className={cn(
        'rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-foreground',
        className,
      )}
      role="status"
    >
      Copied
    </span>
  );
}
