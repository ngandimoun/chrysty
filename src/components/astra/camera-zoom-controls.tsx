'use client';

import { Minus, Plus } from 'lucide-react';
import { useCallback, useEffect, useRef, type RefObject } from 'react';

import { CameraToolButton } from '@/components/astra/camera-tool-button';
import { isCoarsePointer } from '@/lib/device/is-ios';
import type { NumericRange } from '@/lib/camera/track-controls';
import { cn } from '@/lib/utils';

interface CameraZoomControlsProps {
  zoom: number;
  zoomRange: NumericRange;
  disabled?: boolean;
  onZoomChange: (value: number) => void;
  className?: string;
}

const PINCH_ZOOM_SENSITIVITY = 0.55;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function formatZoomLabel(zoom: number): string {
  if (zoom < 10) {
    return `${zoom.toFixed(1).replace(/\.0$/, '')}x`;
  }
  return `${Math.round(zoom)}x`;
}

export function CameraZoomControls({
  zoom,
  zoomRange,
  disabled = false,
  onZoomChange,
  className,
}: CameraZoomControlsProps) {
  const { min, max, step } = zoomRange;
  const progress = max > min ? ((zoom - min) / (max - min)) * 100 : 0;
  const nudgeStep = isCoarsePointer() ? step * 0.5 : step;

  const handleSliderChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onZoomChange(Number(event.target.value));
    },
    [onZoomChange],
  );

  const nudgeZoom = useCallback(
    (direction: -1 | 1) => {
      onZoomChange(clamp(zoom + direction * nudgeStep, min, max));
    },
    [max, min, nudgeStep, onZoomChange, zoom],
  );

  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-y-0 right-0 z-20 flex items-center pr-2 sm:pr-3',
        className,
      )}
    >
      <div className="pointer-events-auto flex flex-col items-center gap-2 rounded-full border border-white/5 bg-slate-950/30 px-1.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-sm">
        <CameraToolButton
          disabled={disabled || zoom >= max}
          onClick={() => nudgeZoom(1)}
          ariaLabel="Zoom in"
          className="size-9 pointer-coarse:size-10"
        >
          <Plus className="size-4" />
        </CameraToolButton>

        <div className="relative flex h-28 w-8 items-center justify-center sm:h-32">
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={zoom}
            disabled={disabled}
            onChange={handleSliderChange}
            aria-label="Camera zoom"
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={zoom}
            aria-valuetext={formatZoomLabel(zoom)}
            className={cn(
              'absolute h-28 w-8 appearance-none bg-transparent sm:h-32',
              '[&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-white/15',
              '[&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-cyan-300/70 [&::-webkit-slider-thumb]:bg-cyan-100 [&::-webkit-slider-thumb]:shadow-[0_0_12px_rgba(31,213,249,0.45)]',
              '[&::-moz-range-track]:h-1 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-white/15',
              '[&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-cyan-300/70 [&::-moz-range-thumb]:bg-cyan-100',
              'disabled:opacity-40',
            )}
            style={{
              writingMode: 'vertical-lr',
              direction: 'rtl',
              background: `linear-gradient(to top, rgba(31,213,249,0.55) ${progress}%, rgba(255,255,255,0.12) ${progress}%)`,
            }}
          />
        </div>

        <span className="min-w-10 text-center text-[0.65rem] font-semibold tabular-nums text-cyan-100/90">
          {formatZoomLabel(zoom)}
        </span>

        <CameraToolButton
          disabled={disabled || zoom <= min}
          onClick={() => nudgeZoom(-1)}
          ariaLabel="Zoom out"
          className="size-9 pointer-coarse:size-10"
        >
          <Minus className="size-4" />
        </CameraToolButton>
      </div>
    </div>
  );
}

export function usePinchZoom({
  enabled,
  zoom,
  zoomRange,
  onZoomChange,
}: {
  enabled: boolean;
  zoom: number;
  zoomRange: NumericRange | null;
  onZoomChange: (value: number) => void;
}) {
  const pinchRef = useRef<{
    distance: number;
    zoom: number;
  } | null>(null);
  const lastUpdateRef = useRef(0);
  const isPinchingRef = useRef(false);

  const onTouchStart = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      if (!enabled || !zoomRange || event.touches.length !== 2) return;

      const [first, second] = [event.touches[0], event.touches[1]];
      if (!first || !second) return;

      const distance = Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
      pinchRef.current = { distance, zoom };
      isPinchingRef.current = true;
    },
    [enabled, zoom, zoomRange],
  );

  const onTouchMove = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      if (!enabled || !zoomRange || !pinchRef.current || event.touches.length !== 2) return;

      const [first, second] = [event.touches[0], event.touches[1]];
      if (!first || !second) return;

      const now = performance.now();
      if (now - lastUpdateRef.current < 16) return;
      lastUpdateRef.current = now;

      const distance = Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
      if (pinchRef.current.distance <= 0) return;

      const ratio = distance / pinchRef.current.distance;
      const damped = Math.pow(ratio, PINCH_ZOOM_SENSITIVITY);
      const nextZoom = clamp(pinchRef.current.zoom * damped, zoomRange.min, zoomRange.max);
      pinchRef.current = { distance, zoom: nextZoom };
      onZoomChange(nextZoom);
      event.preventDefault();
    },
    [enabled, onZoomChange, zoomRange],
  );

  const onTouchEnd = useCallback(() => {
    pinchRef.current = null;
    isPinchingRef.current = false;
  }, []);

  return {
    isPinchingRef,
    pinchHandlers: enabled && zoomRange
      ? {
          onTouchStart,
          onTouchMove,
          onTouchEnd,
          onTouchCancel: onTouchEnd,
        }
      : {},
  };
}

export function useNonPassivePinchGuard(
  elementRef: RefObject<HTMLElement | null>,
  isPinchingRef: RefObject<boolean>,
  enabled: boolean,
): void {
  useEffect(() => {
    const element = elementRef.current;
    if (!element || !enabled) return;

    const onTouchMove = (event: TouchEvent) => {
      if (isPinchingRef.current && event.touches.length >= 2) {
        event.preventDefault();
      }
    };

    element.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => element.removeEventListener('touchmove', onTouchMove);
  }, [elementRef, enabled, isPinchingRef]);
}

export function useWheelZoom({
  enabled,
  zoom,
  zoomRange,
  onZoomChange,
  elementRef,
}: {
  enabled: boolean;
  zoom: number;
  zoomRange: NumericRange | null;
  onZoomChange: (value: number) => void;
  elementRef: RefObject<HTMLElement | null>;
}): void {
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  useEffect(() => {
    const element = elementRef.current;
    if (!enabled || !zoomRange || !element) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const direction = event.deltaY < 0 ? 1 : -1;
      const nextZoom = clamp(
        zoomRef.current + direction * zoomRange.step,
        zoomRange.min,
        zoomRange.max,
      );
      onZoomChange(nextZoom);
    };

    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [elementRef, enabled, onZoomChange, zoomRange]);
}
