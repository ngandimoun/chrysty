'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Eye, EyeOff, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { LiveGuideDirective } from '@/lib/gemini/voice-response-schema';
import type { TrackedAnchor } from '@/lib/camera/anchor-tracker';
import { cn } from '@/lib/utils';

const LOW_CONFIDENCE = 0.5;

interface Size {
  width: number;
  height: number;
}

interface PixelPoint {
  x: number;
  y: number;
}

export interface ChrystyCursorOverlayProps {
  directives: LiveGuideDirective[];
  /** Per-directive tracking translation from the anchor tracker (normalized image space). */
  tracking: Record<string, TrackedAnchor>;
  /** Intrinsic dimensions of the camera content (video pixels). */
  contentDimensions: Size | null;
  /** True when the selfie camera preview is CSS-mirrored. */
  mirrored: boolean;
  coachingNote?: string | null;
  watchMeEnabled: boolean;
  watchMeBusy?: boolean;
  onToggleWatchMe: () => void;
  onExit: () => void;
}

function emphasisColors(emphasis: LiveGuideDirective['emphasis']): {
  stroke: string;
  fill: string;
  glow: string;
} {
  if (emphasis === 'warning') {
    return { stroke: '#fbbf24', fill: 'rgba(251,191,36,0.16)', glow: 'rgba(251,191,36,0.45)' };
  }
  if (emphasis === 'secondary') {
    return { stroke: '#e2e8f0', fill: 'rgba(226,232,240,0.12)', glow: 'rgba(226,232,240,0.3)' };
  }
  return { stroke: '#67e8f9', fill: 'rgba(103,232,249,0.14)', glow: 'rgba(31,213,249,0.5)' };
}

/**
 * Maps a normalized point on the camera content to overlay pixels, accounting
 * for the preview's object-cover crop and optional selfie mirroring.
 */
function projectPoint(
  point: { x: number; y: number },
  container: Size,
  content: Size,
  mirrored: boolean,
  offset: { dx: number; dy: number },
): PixelPoint {
  const x = Math.min(Math.max(point.x + offset.dx, 0), 1);
  const y = Math.min(Math.max(point.y + offset.dy, 0), 1);
  const mirroredX = mirrored ? 1 - x : x;

  const scale = Math.max(container.width / content.width, container.height / content.height);
  const renderedWidth = content.width * scale;
  const renderedHeight = content.height * scale;
  const offsetX = (container.width - renderedWidth) / 2;
  const offsetY = (container.height - renderedHeight) / 2;

  return {
    x: mirroredX * renderedWidth + offsetX,
    y: y * renderedHeight + offsetY,
  };
}

function boundingBox(points: PixelPoint[]): { x: number; y: number; width: number; height: number } {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    x: minX,
    y: minY,
    width: Math.max(Math.max(...xs) - minX, 12),
    height: Math.max(Math.max(...ys) - minY, 12),
  };
}

function toPolylinePath(points: PixelPoint[]): string {
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(' ');
}

function DirectiveLabel({
  anchor,
  label,
  sequence,
  stroke,
  dimmed,
  containerWidth,
}: {
  anchor: PixelPoint;
  label?: string;
  sequence?: number;
  stroke: string;
  dimmed: boolean;
  containerWidth: number;
}) {
  if (!label && sequence === undefined) return null;

  const placeLeft = anchor.x > containerWidth * 0.6;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: dimmed ? 0.55 : 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25, delay: 0.15 }}
      className="pointer-events-none absolute z-10 flex max-w-48 items-center gap-1.5 rounded-full border bg-slate-950/85 px-2.5 py-1 text-[0.7rem] font-semibold leading-tight text-white shadow-[0_4px_18px_rgba(0,0,0,0.4)] backdrop-blur-sm"
      style={{
        left: anchor.x,
        top: anchor.y,
        borderColor: `${stroke}66`,
        transform: `translate(${placeLeft ? 'calc(-100% - 16px)' : '16px'}, -50%)`,
      }}
    >
      {sequence !== undefined ? (
        <span
          className="flex size-4 shrink-0 items-center justify-center rounded-full text-[0.6rem] font-bold text-slate-950"
          style={{ backgroundColor: stroke }}
        >
          {sequence}
        </span>
      ) : null}
      {label ? <span className="truncate">{label}</span> : null}
    </motion.div>
  );
}

export function ChrystyCursorOverlay({
  directives,
  tracking,
  contentDimensions,
  mirrored,
  coachingNote,
  watchMeEnabled,
  watchMeBusy = false,
  onToggleWatchMe,
  onExit,
}: ChrystyCursorOverlayProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = useState<Size | null>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const updateSize = () => {
      const bounds = element.getBoundingClientRect();
      setContainerSize((current) =>
        current && current.width === bounds.width && current.height === bounds.height
          ? current
          : { width: bounds.width, height: bounds.height },
      );
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const rendered = useMemo(() => {
    if (!containerSize || !contentDimensions || containerSize.width === 0) {
      return [];
    }

    return directives.map((directive) => {
      const track = tracking[directive.id];
      const offset = track ? { dx: track.dx, dy: track.dy } : { dx: 0, dy: 0 };
      const dimmed = Boolean(track && track.confidence < LOW_CONFIDENCE);
      const points = directive.points.map((point) =>
        projectPoint(point, containerSize, contentDimensions, mirrored, offset),
      );
      return { directive, points, dimmed };
    });
  }, [containerSize, contentDimensions, directives, mirrored, tracking]);

  return (
    <div ref={containerRef} className="pointer-events-none absolute inset-0 z-20" aria-hidden={false}>
      {containerSize ? (
        <svg
          className="absolute inset-0 size-full"
          viewBox={`0 0 ${containerSize.width} ${containerSize.height}`}
          role="presentation"
        >
          <AnimatePresence>
            {rendered.map(({ directive, points, dimmed }) => {
              const colors = emphasisColors(directive.emphasis);
              const opacity = dimmed ? 0.55 : 1;

              if (directive.kind === 'pointer') {
                const anchor = points[0];
                return (
                  <motion.g
                    key={directive.id}
                    initial={{ opacity: 0, scale: 0.4 }}
                    animate={{ opacity, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.6 }}
                    transition={{ type: 'spring', stiffness: 320, damping: 22 }}
                    style={{ transformOrigin: `${anchor.x}px ${anchor.y}px` }}
                  >
                    <motion.circle
                      cx={anchor.x}
                      cy={anchor.y}
                      r={14}
                      fill="none"
                      stroke={colors.stroke}
                      strokeWidth={2}
                      initial={{ scale: 0.7, opacity: 0.9 }}
                      animate={{ scale: [0.85, 1.7], opacity: [0.85, 0] }}
                      transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
                      style={{ transformOrigin: `${anchor.x}px ${anchor.y}px` }}
                    />
                    <circle
                      cx={anchor.x}
                      cy={anchor.y}
                      r={13}
                      fill="none"
                      stroke="rgba(8,15,30,0.75)"
                      strokeWidth={4}
                    />
                    <circle cx={anchor.x} cy={anchor.y} r={13} fill="none" stroke={colors.stroke} strokeWidth={2} />
                    <circle cx={anchor.x} cy={anchor.y} r={4.5} fill={colors.stroke} />
                    <circle cx={anchor.x} cy={anchor.y} r={22} fill={colors.glow} opacity={0.12} />
                  </motion.g>
                );
              }

              if (directive.kind === 'path') {
                const path = toPolylinePath(points);
                const end = points[points.length - 1];
                const previous = points[points.length - 2] ?? points[0];
                const angle = Math.atan2(end.y - previous.y, end.x - previous.x);
                const arrowSize = 11;

                return (
                  <motion.g
                    key={directive.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <path
                      d={path}
                      fill="none"
                      stroke="rgba(8,15,30,0.75)"
                      strokeWidth={6}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <motion.path
                      d={path}
                      fill="none"
                      stroke={colors.stroke}
                      strokeWidth={2.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeDasharray="10 7"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 0.9, ease: 'easeOut' }}
                    />
                    <motion.polygon
                      points={`0,${-arrowSize / 2} ${arrowSize},0 0,${arrowSize / 2}`}
                      fill={colors.stroke}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.75, duration: 0.25 }}
                      transform={`translate(${end.x}, ${end.y}) rotate(${(angle * 180) / Math.PI})`}
                    />
                    <circle r={4} fill={colors.stroke}>
                      <animateMotion dur="2.4s" repeatCount="indefinite" path={path} />
                    </circle>
                  </motion.g>
                );
              }

              if (directive.kind === 'region') {
                const box = boundingBox(points);
                return (
                  <motion.g
                    key={directive.id}
                    initial={{ opacity: 0, scale: 0.94 }}
                    animate={{ opacity, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 24 }}
                    style={{
                      transformOrigin: `${box.x + box.width / 2}px ${box.y + box.height / 2}px`,
                    }}
                  >
                    <rect
                      x={box.x}
                      y={box.y}
                      width={box.width}
                      height={box.height}
                      rx={12}
                      fill={colors.fill}
                      stroke="rgba(8,15,30,0.7)"
                      strokeWidth={4}
                    />
                    <rect
                      x={box.x}
                      y={box.y}
                      width={box.width}
                      height={box.height}
                      rx={12}
                      fill="none"
                      stroke={colors.stroke}
                      strokeWidth={2}
                    />
                  </motion.g>
                );
              }

              // ghost — semi-transparent target end-state outline.
              const ghostPath = `${toPolylinePath(points)}${points.length > 2 ? ' Z' : ''}`;
              return (
                <motion.g
                  key={directive.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: dimmed ? 0.4 : [0.55, 0.85, 0.55] }}
                  exit={{ opacity: 0 }}
                  transition={
                    dimmed
                      ? { duration: 0.3 }
                      : { duration: 2.6, repeat: Infinity, ease: 'easeInOut' }
                  }
                >
                  <path
                    d={ghostPath}
                    fill={points.length > 2 ? colors.fill : 'none'}
                    stroke={colors.stroke}
                    strokeWidth={2}
                    strokeDasharray="5 6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </motion.g>
              );
            })}
          </AnimatePresence>
        </svg>
      ) : null}

      {containerSize
        ? rendered.map(({ directive, points, dimmed }) => {
            const colors = emphasisColors(directive.emphasis);
            const anchor =
              directive.kind === 'region' || directive.kind === 'ghost'
                ? { x: boundingBox(points).x + boundingBox(points).width / 2, y: boundingBox(points).y }
                : points[0];
            return (
              <DirectiveLabel
                key={`${directive.id}-label`}
                anchor={anchor}
                label={directive.label}
                sequence={directive.sequence}
                stroke={colors.stroke}
                dimmed={dimmed}
                containerWidth={containerSize.width}
              />
            );
          })
        : null}

      <div className="absolute inset-x-0 top-0 z-30 flex justify-center p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <AnimatePresence>
          {coachingNote ? (
            <motion.p
              key={coachingNote}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="pointer-events-none max-w-[80%] truncate rounded-full border border-cyan-400/25 bg-slate-950/80 px-4 py-1.5 text-xs font-medium text-cyan-50 shadow-[0_0_24px_rgba(31,213,249,0.18)] backdrop-blur-sm"
            >
              {coachingNote}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-3 z-30 flex flex-col items-start gap-2">
        <span className="pointer-events-none inline-flex items-center gap-1.5 rounded-full border border-cyan-400/30 bg-slate-950/80 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-cyan-200 backdrop-blur-sm">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-cyan-300 opacity-75" />
            <span className="relative inline-flex size-1.5 rounded-full bg-cyan-300" />
          </span>
          Live guide
        </span>

        <button
          type="button"
          onClick={onToggleWatchMe}
          aria-pressed={watchMeEnabled}
          className={cn(
            'pointer-events-auto inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold backdrop-blur-sm transition-colors',
            watchMeEnabled
              ? 'border-cyan-300/50 bg-cyan-400/20 text-cyan-100'
              : 'border-white/15 bg-slate-950/70 text-slate-200 hover:bg-slate-900/80',
          )}
        >
          {watchMeEnabled ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
          Watch me
          {watchMeEnabled && watchMeBusy ? (
            <span className="size-1.5 animate-pulse rounded-full bg-cyan-200" aria-hidden />
          ) : null}
        </button>

        <button
          type="button"
          onClick={onExit}
          className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-slate-950/70 px-3 py-1.5 text-xs font-semibold text-slate-200 backdrop-blur-sm transition-colors hover:bg-slate-900/80"
        >
          <X className="size-3.5" />
          End guide
        </button>
      </div>
    </div>
  );
}
