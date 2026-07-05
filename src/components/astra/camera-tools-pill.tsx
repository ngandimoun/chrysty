'use client';

import { Grid3x3, Minus, Plus, Ratio, Sun, Timer } from 'lucide-react';
import { useState } from 'react';

import { CameraToolButton } from '@/components/astra/camera-tool-button';
import { getAspectRatioLabel, getNextAspectRatio } from '@/lib/camera/aspect-ratio';
import type { NumericRange } from '@/lib/camera/track-controls';
import type { CameraAspectRatio, CameraTimerSeconds } from '@/lib/camera/types';
import { cn } from '@/lib/utils';

const TIMER_OPTIONS: CameraTimerSeconds[] = [0, 3, 5, 10, 15, 30];

function getTimerLabel(seconds: CameraTimerSeconds): string {
  if (seconds === 0) return 'Timer off';
  return `${seconds}s timer`;
}

interface CameraToolsPillProps {
  disabled?: boolean;
  gridVisible: boolean;
  timerSeconds: CameraTimerSeconds;
  aspectRatio: CameraAspectRatio;
  exposureCompensation: number;
  canAdjustExposure: boolean;
  exposureRange: NumericRange | null;
  onToggleGrid: () => void;
  onCycleTimer: () => void;
  onCycleAspectRatio: () => void;
  onExposureChange: (value: number) => void;
  className?: string;
}

export function CameraToolsPill({
  disabled = false,
  gridVisible,
  timerSeconds,
  aspectRatio,
  exposureCompensation,
  canAdjustExposure,
  exposureRange,
  onToggleGrid,
  onCycleTimer,
  onCycleAspectRatio,
  onExposureChange,
  className,
}: CameraToolsPillProps) {
  const [exposureOpen, setExposureOpen] = useState(false);

  const handleExposureStep = (direction: -1 | 1) => {
    if (!exposureRange) return;
    const next = Math.min(
      exposureRange.max,
      Math.max(exposureRange.min, exposureCompensation + direction * exposureRange.step),
    );
    onExposureChange(next);
  };

  return (
    <div className={cn('pointer-events-auto flex flex-col items-start gap-2', className)}>
      <div className="flex items-center gap-2 rounded-full border border-white/5 bg-slate-950/30 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-sm">
          <CameraToolButton
            active={gridVisible}
            disabled={disabled}
            onClick={onToggleGrid}
            ariaLabel={gridVisible ? 'Hide grid overlay' : 'Show grid overlay'}
            ariaPressed={gridVisible}
          >
            <Grid3x3 className="size-5" />
          </CameraToolButton>

          <CameraToolButton
            active={timerSeconds > 0}
            disabled={disabled}
            onClick={onCycleTimer}
            ariaLabel={getTimerLabel(timerSeconds)}
            ariaPressed={timerSeconds > 0}
          >
            <Timer className="size-5" />
          </CameraToolButton>

          <CameraToolButton
            disabled={disabled}
            onClick={onCycleAspectRatio}
            ariaLabel={`Aspect ratio ${getAspectRatioLabel(aspectRatio)}`}
          >
            <Ratio className="size-5" />
          </CameraToolButton>

          {canAdjustExposure && exposureRange ? (
            <CameraToolButton
              active={exposureOpen}
              disabled={disabled}
              onClick={() => setExposureOpen((open) => !open)}
              ariaLabel="Adjust exposure"
              ariaPressed={exposureOpen}
            >
              <Sun className="size-5" />
            </CameraToolButton>
          ) : null}
        </div>

        <div className="flex items-center gap-2 pl-1 text-[0.65rem] font-medium text-cyan-100/75">
          {timerSeconds > 0 ? <span>{getTimerLabel(timerSeconds)}</span> : null}
          <span>{getAspectRatioLabel(aspectRatio)}</span>
        </div>

        {exposureOpen && canAdjustExposure && exposureRange ? (
          <div className="flex items-center gap-2 rounded-full border border-white/5 bg-slate-950/45 px-2 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-sm">
            <CameraToolButton
              disabled={disabled || exposureCompensation <= exposureRange.min}
              onClick={() => handleExposureStep(-1)}
              ariaLabel="Decrease exposure"
              className="size-9 pointer-coarse:size-10"
            >
              <Minus className="size-4" />
            </CameraToolButton>
            <span className="min-w-12 text-center text-xs font-semibold tabular-nums text-cyan-100">
              {exposureCompensation > 0 ? '+' : ''}
              {exposureCompensation.toFixed(1)}
            </span>
            <CameraToolButton
              disabled={disabled || exposureCompensation >= exposureRange.max}
              onClick={() => handleExposureStep(1)}
              ariaLabel="Increase exposure"
              className="size-9 pointer-coarse:size-10"
            >
              <Plus className="size-4" />
            </CameraToolButton>
          </div>
        ) : null}
    </div>
  );
}

export function cycleTimerSeconds(current: CameraTimerSeconds): CameraTimerSeconds {
  const index = TIMER_OPTIONS.indexOf(current);
  const nextIndex = (index + 1) % TIMER_OPTIONS.length;
  return TIMER_OPTIONS[nextIndex] ?? 0;
}

export function cycleAspectRatio(current: CameraAspectRatio): CameraAspectRatio {
  return getNextAspectRatio(current);
}
