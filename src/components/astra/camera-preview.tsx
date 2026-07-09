'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Flashlight, FlipHorizontal } from 'lucide-react';

import { CameraFocusReticle } from '@/components/astra/camera-focus-reticle';
import { CameraGridOverlay } from '@/components/astra/camera-grid-overlay';
import { CameraToolButton } from '@/components/astra/camera-tool-button';
import {
  CameraToolsPill,
  cycleAspectRatio,
  cycleTimerSeconds,
} from '@/components/astra/camera-tools-pill';
import {
  CameraZoomControls,
  useNonPassivePinchGuard,
  usePinchZoom,
  useWheelZoom,
} from '@/components/astra/camera-zoom-controls';
import { FocusAnnotationOverlay } from '@/components/astra/focus-annotation-overlay';
import { Button } from '@/components/ui/button';
import { useViewportOrientation } from '@/hooks/use-viewport-orientation';
import {
  CAMERA_PREVIEW_SHELL_BASE_CLASS,
  getOrientationAwareShellClass,
} from '@/lib/camera/aspect-ratio';
import type { NumericRange } from '@/lib/camera/track-controls';
import { MAX_PENDING_PHOTOS, type CameraAspectRatio, type CameraTimerSeconds, type FocusAnnotation } from '@/lib/camera/types';
import { cn } from '@/lib/utils';

interface CameraPreviewProps {
  stream: MediaStream;
  facing: 'environment' | 'user';
  aspectRatio?: CameraAspectRatio;
  onVideoReady?: (video: HTMLVideoElement) => void;
  className?: string;
  /** Extra overlay layer rendered above the preview (e.g. Live Guide cursor). */
  overlaySlot?: React.ReactNode;
  pendingPhotoCount?: number;
  canFlipCamera?: boolean;
  canUseTorch?: boolean;
  torchOn?: boolean;
  zoom?: number;
  zoomRange?: NumericRange | null;
  canZoom?: boolean;
  exposureCompensation?: number;
  exposureRange?: NumericRange | null;
  canAdjustExposure?: boolean;
  canFocusAtPoint?: boolean;
  controlsDisabled?: boolean;
  focusAnnotations?: FocusAnnotation[];
  onTakePhoto?: () => void;
  onFlipCamera?: () => void;
  onToggleTorch?: () => void;
  onZoomChange?: (value: number) => void;
  onExposureChange?: (value: number) => void;
  onAspectRatioChange?: (ratio: CameraAspectRatio) => void;
  onFocusAtPoint?: (x: number, y: number) => void;
  onFocusAnnotationsChange?: (annotations: FocusAnnotation[]) => void;
}

export function CameraPreview({
  stream,
  facing,
  aspectRatio = '16:9',
  onVideoReady,
  className,
  overlaySlot,
  pendingPhotoCount = 0,
  canFlipCamera = false,
  canUseTorch = false,
  torchOn = false,
  zoom = 1,
  zoomRange = null,
  canZoom = false,
  exposureCompensation = 0,
  exposureRange = null,
  canAdjustExposure = false,
  canFocusAtPoint = false,
  controlsDisabled = false,
  focusAnnotations = [],
  onTakePhoto,
  onFlipCamera,
  onToggleTorch,
  onZoomChange,
  onExposureChange,
  onAspectRatioChange,
  onFocusAtPoint,
  onFocusAnnotationsChange,
}: CameraPreviewProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const countdownTimerRef = useRef<number | null>(null);

  const { isLandscape, viewportWidth, viewportHeight, isCoarsePointer } = useViewportOrientation();

  const [gridVisible, setGridVisible] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState<CameraTimerSeconds>(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);

  const atPhotoLimit = pendingPhotoCount >= MAX_PENDING_PHOTOS;
  const showTopTools = canFlipCamera || canUseTorch;
  const controlsLocked = controlsDisabled || countdown !== null;
  const previewAspect = viewportHeight > 0 ? viewportWidth / viewportHeight : 1;
  const useMobileLandscapeLayout = isCoarsePointer && isLandscape;
  const shellClass = getOrientationAwareShellClass({
    isLandscape,
    isCoarsePointer,
    userAspectRatio: aspectRatio,
  });

  const { pinchHandlers, isPinchingRef } = usePinchZoom({
    enabled: canZoom && Boolean(zoomRange) && !controlsLocked,
    zoom,
    zoomRange,
    onZoomChange: (value) => onZoomChange?.(value),
  });

  useNonPassivePinchGuard(shellRef, isPinchingRef, canZoom && Boolean(zoomRange));

  useWheelZoom({
    enabled: canZoom && Boolean(zoomRange) && !controlsLocked && !isCoarsePointer,
    zoom,
    zoomRange,
    onZoomChange: (value) => onZoomChange?.(value),
    elementRef: shellRef,
  });

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    let readyFired = false;

    const notifyReady = () => {
      if (cancelled || readyFired) return;
      readyFired = true;
      onVideoReady?.(video);
    };

    video.srcObject = stream;
    void video.play().catch(() => {});

    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      notifyReady();
    } else {
      video.addEventListener('loadeddata', notifyReady, { once: true });
      video.addEventListener('canplay', notifyReady, { once: true });
    }

    return () => {
      cancelled = true;
      video.removeEventListener('loadeddata', notifyReady);
      video.removeEventListener('canplay', notifyReady);
      video.pause();
      if (video.srcObject === stream) {
        video.srcObject = null;
      }
    };
  }, [stream, onVideoReady]);

  useEffect(() => {
    return () => {
      if (countdownTimerRef.current !== null) {
        window.clearInterval(countdownTimerRef.current);
      }
    };
  }, []);

  const cancelCountdown = useCallback(() => {
    if (countdownTimerRef.current !== null) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setCountdown(null);
  }, []);

  const triggerCapture = useCallback(() => {
    onTakePhoto?.();
  }, [onTakePhoto]);

  const handleShutterPress = useCallback(() => {
    if (controlsLocked || atPhotoLimit) return;

    if (timerSeconds <= 0) {
      triggerCapture();
      return;
    }

    cancelCountdown();
    setCountdown(timerSeconds);

    countdownTimerRef.current = window.setInterval(() => {
      setCountdown((current) => {
        if (current === null || current <= 1) {
          if (countdownTimerRef.current !== null) {
            window.clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
          }
          window.setTimeout(() => triggerCapture(), 0);
          return null;
        }
        return current - 1;
      });
    }, 1000);
  }, [atPhotoLimit, cancelCountdown, controlsLocked, timerSeconds, triggerCapture]);

  const handleQuickTap = useCallback(
    (point: { x: number; y: number }) => {
      if (!canFocusAtPoint || controlsLocked) return;
      setFocusPoint(point);
      onFocusAtPoint?.(point.x, point.y);
    },
    [canFocusAtPoint, controlsLocked, onFocusAtPoint],
  );

  const handleCycleTimer = useCallback(() => {
    setTimerSeconds((current) => cycleTimerSeconds(current));
  }, []);

  const handleCycleAspectRatio = useCallback(() => {
    const nextRatio = cycleAspectRatio(aspectRatio);
    onAspectRatioChange?.(nextRatio);
  }, [aspectRatio, onAspectRatioChange]);

  return (
    <div
      ref={shellRef}
      className={cn(CAMERA_PREVIEW_SHELL_BASE_CLASS, shellClass, className)}
      {...pinchHandlers}
    >
      <video
        ref={videoRef}
        data-camera-preview
        autoPlay
        playsInline
        muted
        className={cn('size-full object-cover', facing === 'user' ? 'scale-x-[-1]' : '')}
        aria-label="Live camera preview"
      />

      <CameraGridOverlay visible={gridVisible} />

      <CameraFocusReticle point={focusPoint} />

      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-linear-to-t from-slate-950/80 to-transparent"
        aria-hidden
      />

      <FocusAnnotationOverlay
        annotations={focusAnnotations}
        onChange={(annotations) => onFocusAnnotationsChange?.(annotations)}
        disabled={controlsLocked || !onFocusAnnotationsChange}
        onQuickTap={canFocusAtPoint ? handleQuickTap : undefined}
        previewAspect={previewAspect}
        className="z-10"
        renderToolbar={(toolbar) => (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:p-4">
            <div
              className={cn(
                'grid items-start gap-2',
                useMobileLandscapeLayout
                  ? 'grid-cols-[auto_1fr_auto]'
                  : 'grid-cols-[auto_1fr_auto] max-sm:grid-cols-1 max-sm:justify-items-center',
              )}
            >
              <CameraToolsPill
                disabled={controlsLocked}
                gridVisible={gridVisible}
                timerSeconds={timerSeconds}
                aspectRatio={aspectRatio}
                exposureCompensation={exposureCompensation}
                canAdjustExposure={canAdjustExposure}
                exposureRange={exposureRange}
                onToggleGrid={() => setGridVisible((visible) => !visible)}
                onCycleTimer={handleCycleTimer}
                onCycleAspectRatio={handleCycleAspectRatio}
                onExposureChange={(value) => onExposureChange?.(value)}
                className={cn(
                  'justify-self-start',
                  !useMobileLandscapeLayout && 'max-sm:order-2',
                )}
              />

              <div
                className={cn(
                  'pointer-events-auto flex justify-center',
                  !useMobileLandscapeLayout && 'max-sm:order-1',
                )}
              >
                {toolbar}
              </div>

              {showTopTools ? (
                <div
                  className={cn(
                    'pointer-events-auto flex items-center justify-end justify-self-end gap-2 rounded-full border border-white/5 bg-slate-950/30 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-sm',
                    !useMobileLandscapeLayout && 'max-sm:order-3',
                  )}
                >
                  {canUseTorch ? (
                    <CameraToolButton
                      active={torchOn}
                      disabled={controlsLocked}
                      onClick={() => onToggleTorch?.()}
                      ariaLabel={torchOn ? 'Turn off flashlight' : 'Turn on flashlight'}
                      ariaPressed={torchOn}
                    >
                      <Flashlight className={cn('size-5', torchOn && 'fill-cyan-200/30')} />
                    </CameraToolButton>
                  ) : null}
                  {canFlipCamera ? (
                    <CameraToolButton
                      disabled={controlsLocked}
                      onClick={() => onFlipCamera?.()}
                      ariaLabel="Switch to selfie camera"
                    >
                      <FlipHorizontal className="size-5" />
                    </CameraToolButton>
                  ) : null}
                </div>
              ) : (
                <div className={cn(!useMobileLandscapeLayout && 'max-sm:hidden')} aria-hidden />
              )}
            </div>
          </div>
        )}
      />

      {overlaySlot}

      {canZoom && zoomRange ? (
        <CameraZoomControls
          zoom={zoom}
          zoomRange={zoomRange}
          disabled={controlsLocked}
          onZoomChange={(value) => onZoomChange?.(value)}
          className={useMobileLandscapeLayout ? 'pr-4' : undefined}
        />
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-2 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
        {countdown !== null ? (
          <button
            type="button"
            onClick={cancelCountdown}
            className="pointer-events-auto rounded-full border border-cyan-400/40 bg-slate-950/80 px-4 py-1.5 text-sm font-semibold tabular-nums text-cyan-100 shadow-[0_0_24px_rgba(31,213,249,0.25)]"
            aria-label={`Cancel ${countdown} second timer`}
          >
            {countdown}
          </button>
        ) : null}

        <div className="pointer-events-auto relative">
          <Button
            type="button"
            variant="ghost"
            disabled={controlsLocked || atPhotoLimit}
            onClick={handleShutterPress}
            aria-label={
              pendingPhotoCount > 0
                ? `Capture photo, ${pendingPhotoCount} of ${MAX_PENDING_PHOTOS} captured`
                : timerSeconds > 0
                  ? `Capture photo with ${timerSeconds} second timer`
                  : 'Capture photo'
            }
            className={cn(
              'size-18 rounded-full border-4 border-white/90 bg-white/15 p-0 shadow-[0_0_24px_rgba(31,213,249,0.25)] backdrop-blur-sm',
              'transition-[transform,background-color,box-shadow] duration-200 ease-out',
              'hover:border-cyan-100 hover:bg-white/25 hover:shadow-[0_0_32px_rgba(31,213,249,0.35)]',
              'active:scale-95 disabled:border-white/40 disabled:bg-white/5',
              'pointer-coarse:size-20 pointer-coarse:border-[5px]',
            )}
          >
            <span className="size-13 rounded-full border-2 border-white/70 bg-white/90 shadow-inner pointer-coarse:size-14" />
          </Button>
          {pendingPhotoCount > 0 ? (
            <span className="absolute -right-1 -top-1 flex min-w-6 items-center justify-center rounded-full border border-cyan-400/40 bg-slate-950/90 px-1.5 py-0.5 text-[0.65rem] font-semibold tabular-nums text-cyan-100">
              {pendingPhotoCount}/{MAX_PENDING_PHOTOS}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
