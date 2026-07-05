'use client';

import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const touchButtonClass =
  'pointer-coarse:min-h-11 pointer-coarse:min-w-11 touch-manipulation active:scale-95';

export const cameraToolButtonClass = cn(
  'size-11 rounded-full border border-border bg-card text-foreground shadow-sm',
  'transition-[transform,background-color,border-color,box-shadow] duration-200 ease-out',
  'hover:border-primary/40 hover:bg-accent hover:text-foreground',
  'focus-visible:border-primary/50 focus-visible:ring-ring/25',
  'disabled:shadow-none',
  touchButtonClass,
  'pointer-coarse:size-12',
);

export const cameraToolButtonActiveClass =
  'border-primary/55 bg-primary/10 text-foreground shadow-[0_0_22px_rgba(31,213,249,0.18)] dark:shadow-[0_0_22px_rgba(31,213,249,0.28)]';

interface CameraToolButtonProps {
  children: ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  ariaLabel: string;
  ariaPressed?: boolean;
  className?: string;
}

export function CameraToolButton({
  children,
  active = false,
  disabled = false,
  onClick,
  ariaLabel,
  ariaPressed,
  className,
}: CameraToolButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-lg"
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      className={cn(cameraToolButtonClass, active && cameraToolButtonActiveClass, className)}
    >
      {children}
    </Button>
  );
}
