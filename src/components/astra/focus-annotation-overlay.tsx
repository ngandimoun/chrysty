'use client';

import { ArrowUpRight, Circle, Highlighter, MousePointer2, PencilLine, Square } from 'lucide-react';
import type { ReactNode } from 'react';
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

import type { FocusAnnotation, FocusAnnotationShape } from '@/lib/camera/types';
import { isCoarsePointer } from '@/lib/device/is-ios';
import { createUuid } from '@/lib/ids';
import { cn } from '@/lib/utils';

const MIN_ANNOTATION_SIZE_PX = 28;
const HIT_PADDING_PX = 14;
const POINTER_SIZE = 0.085;
const QUICK_TAP_MOVE_THRESHOLD_PX = 8;
const QUICK_TAP_DURATION_MS = 250;

const shapeOptions: Array<{
  value: FocusAnnotationShape;
  label: string;
  icon: typeof Circle;
}> = [
  { value: 'circle', label: 'Circle annotation', icon: Circle },
  { value: 'rect', label: 'Rectangle annotation', icon: Square },
  { value: 'highlight', label: 'Highlight annotation', icon: Highlighter },
  { value: 'arrow', label: 'Arrow annotation', icon: ArrowUpRight },
  { value: 'pointer', label: 'Pointer annotation', icon: MousePointer2 },
];

type DraftAnnotation = Omit<FocusAnnotation, 'id'>;

interface FocusAnnotationOverlayProps {
  annotations: FocusAnnotation[];
  onChange: (annotations: FocusAnnotation[]) => void;
  className?: string;
  toolbarClassName?: string;
  disabled?: boolean;
  previewAspect?: number;
  onQuickTap?: (point: { x: number; y: number }) => void;
  renderToolbar?: (toolbar: ReactNode) => ReactNode;
}

function hitPaddingNormalized(bounds: { width: number; height: number }): number {
  return HIT_PADDING_PX / Math.min(bounds.width, bounds.height);
}

function hasUsableAnnotation(
  annotation: DraftAnnotation | null,
  bounds: { width: number; height: number },
): annotation is DraftAnnotation {
  if (annotation?.shape === 'pointer') {
    return true;
  }

  if (annotation?.shape === 'arrow') {
    const startX = annotation.startX ?? annotation.x;
    const startY = annotation.startY ?? annotation.y;
    const endX = annotation.endX ?? annotation.x + annotation.width;
    const endY = annotation.endY ?? annotation.y + annotation.height;
    const lengthPx = Math.hypot(
      (endX - startX) * bounds.width,
      (endY - startY) * bounds.height,
    );
    return lengthPx >= MIN_ANNOTATION_SIZE_PX;
  }

  if (!annotation) return false;

  const widthPx = annotation.width * bounds.width;
  const heightPx = annotation.height * bounds.height;
  return Math.max(widthPx, heightPx) >= MIN_ANNOTATION_SIZE_PX;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function buildAnnotationFromPoints(
  shape: FocusAnnotationShape,
  anchorX: number,
  anchorY: number,
  currentX: number,
  currentY: number,
  bounds: { width: number; height: number },
): DraftAnnotation {
  if (shape === 'pointer') {
    const size = POINTER_SIZE;
    return {
      shape,
      x: clamp(currentX - size / 2, 0, 1 - size),
      y: clamp(currentY - size / 2, 0, 1 - size),
      width: size,
      height: size,
      endX: currentX,
      endY: currentY,
    };
  }

  if (shape === 'circle') {
    const dxPx = (currentX - anchorX) * bounds.width;
    const dyPx = (currentY - anchorY) * bounds.height;
    const radiusPx = Math.max(Math.abs(dxPx), Math.abs(dyPx)) / 2;
    const diameterPx = Math.max(radiusPx * 2, MIN_ANNOTATION_SIZE_PX);
    const width = diameterPx / bounds.width;
    const height = diameterPx / bounds.height;
    const centerX = (anchorX + currentX) / 2;
    const centerY = (anchorY + currentY) / 2;

    return {
      shape,
      x: clamp(centerX - width / 2, 0, 1 - width),
      y: clamp(centerY - height / 2, 0, 1 - height),
      width,
      height,
    };
  }

  if (shape === 'arrow') {
    return {
      shape,
      x: Math.min(anchorX, currentX),
      y: Math.min(anchorY, currentY),
      width: Math.abs(currentX - anchorX),
      height: Math.abs(currentY - anchorY),
      startX: anchorX,
      startY: anchorY,
      endX: currentX,
      endY: currentY,
    };
  }

  return {
    shape,
    x: Math.min(anchorX, currentX),
    y: Math.min(anchorY, currentY),
    width: Math.abs(currentX - anchorX),
    height: Math.abs(currentY - anchorY),
  };
}

function pointHitsAnnotation(
  point: { x: number; y: number },
  annotation: FocusAnnotation,
  bounds: { width: number; height: number },
): boolean {
  const padding = hitPaddingNormalized(bounds);
  const x = annotation.x - padding;
  const y = annotation.y - padding;
  const width = annotation.width + padding * 2;
  const height = annotation.height + padding * 2;

  if (annotation.shape !== 'circle') {
    return point.x >= x && point.x <= x + width && point.y >= y && point.y <= y + height;
  }

  const radiusX = width / 2;
  const radiusY = height / 2;
  if (radiusX <= 0 || radiusY <= 0) return false;

  const centerX = x + radiusX;
  const centerY = y + radiusY;
  const dx = (point.x - centerX) / radiusX;
  const dy = (point.y - centerY) / radiusY;
  return dx * dx + dy * dy <= 1;
}

function getArrowVector(annotation: DraftAnnotation) {
  const startX = (annotation.startX ?? annotation.x) * 100;
  const startY = (annotation.startY ?? annotation.y) * 100;
  const endX = (annotation.endX ?? annotation.x + annotation.width) * 100;
  const endY = (annotation.endY ?? annotation.y + annotation.height) * 100;
  const angle = Math.atan2(endY - startY, endX - startX);
  const headLength = 4.5;
  const headAngle = Math.PI / 7;

  return {
    startX,
    startY,
    endX,
    endY,
    headA: {
      x: endX - headLength * Math.cos(angle - headAngle),
      y: endY - headLength * Math.sin(angle - headAngle),
    },
    headB: {
      x: endX - headLength * Math.cos(angle + headAngle),
      y: endY - headLength * Math.sin(angle + headAngle),
    },
  };
}

function isToolbarEventTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest('[data-annotation-toolbar="true"]'));
}

function AnnotationPreview({
  annotation,
  selected = false,
  coarsePointer = false,
}: {
  annotation: DraftAnnotation;
  selected?: boolean;
  coarsePointer?: boolean;
}) {
  const x = annotation.x * 100;
  const y = annotation.y * 100;
  const width = annotation.width * 100;
  const height = annotation.height * 100;
  const selectionStroke = selected ? 'rgba(255,255,255,0.92)' : 'rgba(8,15,30,0.78)';
  const selectionStrokeWidth = coarsePointer ? (selected ? '3.2' : '2.4') : selected ? '2.6' : '1.9';
  const accentStrokeWidth = coarsePointer ? '1.5' : '1.1';

  if (annotation.shape === 'arrow') {
    const arrow = getArrowVector(annotation);
    const glowStroke = selected ? 'rgba(255,255,255,0.92)' : 'rgba(8,15,30,0.78)';

    return (
      <>
        <line
          x1={arrow.startX}
          y1={arrow.startY}
          x2={arrow.endX}
          y2={arrow.endY}
          stroke={glowStroke}
          strokeWidth="3.6"
          strokeLinecap="round"
        />
        <polyline
          points={`${arrow.headA.x},${arrow.headA.y} ${arrow.endX},${arrow.endY} ${arrow.headB.x},${arrow.headB.y}`}
          fill="none"
          stroke={glowStroke}
          strokeWidth="3.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <line
          x1={arrow.startX}
          y1={arrow.startY}
          x2={arrow.endX}
          y2={arrow.endY}
          stroke="#7dd3fc"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <polyline
          points={`${arrow.headA.x},${arrow.headA.y} ${arrow.endX},${arrow.endY} ${arrow.headB.x},${arrow.headB.y}`}
          fill="none"
          stroke="#7dd3fc"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </>
    );
  }

  if (annotation.shape === 'pointer') {
    const centerX = (annotation.endX ?? annotation.x + annotation.width / 2) * 100;
    const centerY = (annotation.endY ?? annotation.y + annotation.height / 2) * 100;

    return (
      <>
        <circle
          cx={centerX}
          cy={centerY}
          r={selected ? 4.8 : 4.2}
          fill="rgba(8,15,30,0.82)"
          stroke={selected ? 'rgba(255,255,255,0.92)' : 'rgba(8,15,30,0.78)'}
          strokeWidth="1.8"
        />
        <circle cx={centerX} cy={centerY} r="2.5" fill="#7dd3fc" />
        <path
          d={`M ${centerX} ${centerY + 4.2} L ${centerX - 2.2} ${centerY + 8.4} L ${centerX + 2.2} ${centerY + 8.4} Z`}
          fill="#7dd3fc"
          stroke="rgba(8,15,30,0.78)"
          strokeWidth="0.7"
          strokeLinejoin="round"
        />
      </>
    );
  }

  if (annotation.shape === 'circle') {
    return (
      <>
        <ellipse
          cx={x + width / 2}
          cy={y + height / 2}
          rx={width / 2}
          ry={height / 2}
          fill="none"
          stroke={selectionStroke}
          strokeWidth={selectionStrokeWidth}
        />
        <ellipse
          cx={x + width / 2}
          cy={y + height / 2}
          rx={width / 2}
          ry={height / 2}
          fill="none"
          stroke="#7dd3fc"
          strokeWidth={accentStrokeWidth}
        />
      </>
    );
  }

  if (annotation.shape === 'highlight') {
    return (
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill="rgba(253,224,71,0.24)"
        stroke={selected ? 'rgba(255,255,255,0.96)' : 'rgba(250,204,21,0.95)'}
        strokeWidth={selected ? '1.6' : '1'}
      />
    );
  }

  return (
    <>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill="none"
        stroke={selectionStroke}
        strokeWidth={selectionStrokeWidth}
      />
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill="none"
        stroke="#7dd3fc"
        strokeWidth={accentStrokeWidth}
      />
    </>
  );
}

export function FocusAnnotationOverlay({
  annotations,
  onChange,
  className,
  toolbarClassName,
  disabled = false,
  previewAspect: _previewAspect = 1,
  onQuickTap,
  renderToolbar,
}: FocusAnnotationOverlayProps) {
  const coarsePointer = isCoarsePointer();
  const boundsRef = useRef({ width: 1, height: 1 });
  const [shape, setShape] = useState<FocusAnnotationShape | null>(null);
  const [draftAnnotation, setDraftAnnotation] = useState<DraftAnnotation | null>(null);
  const [dragAnchor, setDragAnchor] = useState<{ x: number; y: number } | null>(null);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(
    annotations.at(-1)?.id ?? null,
  );
  const pointerStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const selectedAnnotation = selectedAnnotationId
    ? annotations.find((annotation) => annotation.id === selectedAnnotationId)
    : null;

  function getNormalizedPoint(event: ReactPointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return null;

    boundsRef.current = { width: bounds.width, height: bounds.height };

    return {
      x: Math.min(Math.max((event.clientX - bounds.left) / bounds.width, 0), 1),
      y: Math.min(Math.max((event.clientY - bounds.top) / bounds.height, 0), 1),
    };
  }

  const getBounds = () => boundsRef.current;

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (isToolbarEventTarget(event.target)) return;

    pointerStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      time: performance.now(),
    };

    const point = getNormalizedPoint(event);
    if (!point) return;

    const hitAnnotation = annotations
      .slice()
      .reverse()
      .find((annotation) => pointHitsAnnotation(point, annotation, getBounds()));

    if (hitAnnotation) {
      setSelectedAnnotationId(hitAnnotation.id);
      setDraftAnnotation(null);
      setDragAnchor(null);
      return;
    }

    if (shape === null) {
      setDragAnchor(point);
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    setDragAnchor(point);
    setDraftAnnotation(
      buildAnnotationFromPoints(shape, point.x, point.y, point.x, point.y, getBounds()),
    );
    setSelectedAnnotationId(null);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled || !dragAnchor || shape === null) return;

    const point = getNormalizedPoint(event);
    if (!point) return;

    setDraftAnnotation(
      buildAnnotationFromPoints(shape, dragAnchor.x, dragAnchor.y, point.x, point.y, getBounds()),
    );
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled) return;

    const start = pointerStartRef.current;
    pointerStartRef.current = null;

    if (hasUsableAnnotation(draftAnnotation, getBounds())) {
      const nextAnnotation: FocusAnnotation = {
        id: createUuid(),
        ...draftAnnotation,
      };

      onChange([...annotations, nextAnnotation]);
      setSelectedAnnotationId(nextAnnotation.id);
    } else if (onQuickTap && start && dragAnchor) {
      const elapsed = performance.now() - start.time;
      const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
      if (elapsed <= QUICK_TAP_DURATION_MS && moved <= QUICK_TAP_MOVE_THRESHOLD_PX) {
        onQuickTap(dragAnchor);
      }
    }

    setDraftAnnotation(null);
    setDragAnchor(null);
  };

  const stopToolbarEvent = (event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleSelectShape = (nextShape: FocusAnnotationShape) => {
    setShape((current) => (current === nextShape ? null : nextShape));
    setDraftAnnotation(null);
    setDragAnchor(null);
    setSelectedAnnotationId(null);
  };

  const handleDeleteSelected = () => {
    if (!selectedAnnotation) return;

    onChange(annotations.filter((annotation) => annotation.id !== selectedAnnotation.id));
    setSelectedAnnotationId(null);
  };

  const handleClearAll = () => {
    onChange([]);
    setDraftAnnotation(null);
    setDragAnchor(null);
    setSelectedAnnotationId(null);
  };

  const toolbar = (
    <div
      data-annotation-toolbar="true"
      className={cn(
        'flex w-fit items-center gap-1 rounded-full border border-white/10 bg-slate-950/80 px-2 py-1 shadow-[0_10px_28px_rgba(0,0,0,0.35)] backdrop-blur-xl',
        toolbarClassName,
      )}
      onPointerDown={stopToolbarEvent}
      onPointerMove={stopToolbarEvent}
      onPointerUp={stopToolbarEvent}
    >
      <div className="flex size-8 items-center justify-center rounded-full bg-cyan-500/10 text-cyan-200" aria-hidden>
        <PencilLine className="size-4" />
      </div>
      <div className="h-5 w-px bg-white/10" aria-hidden />
      {shapeOptions.map((option) => {
        const Icon = option.icon;

        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              handleSelectShape(option.value);
            }}
            aria-label={option.label}
            aria-pressed={shape === option.value}
            className={cn(
              'flex size-8 touch-manipulation items-center justify-center rounded-full border border-transparent bg-transparent text-cyan-50 outline-none transition-colors hover:border-white/10 hover:bg-slate-800/80 focus-visible:border-cyan-300/70 focus-visible:ring-2 focus-visible:ring-cyan-300/30 disabled:pointer-events-none disabled:opacity-50',
              'pointer-coarse:size-11',
              shape === option.value && 'border-cyan-400/45 bg-cyan-500/15 text-cyan-100',
            )}
          >
            <Icon className="size-4" />
          </button>
        );
      })}
      <span className="min-w-12 px-1 text-center text-[0.6rem] font-semibold uppercase tracking-wide text-cyan-100 sm:min-w-14 sm:text-[0.65rem]">
        {shape ?? 'Draw'}
      </span>
      <div className="h-5 w-px bg-white/10" aria-hidden />
      <button
        type="button"
        disabled={disabled || !selectedAnnotation}
        onPointerDown={stopToolbarEvent}
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onTouchStart={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          handleDeleteSelected();
        }}
        aria-label="Delete selected annotation"
        className="flex size-8 touch-manipulation items-center justify-center rounded-full border border-transparent bg-transparent text-cyan-50 outline-none transition-colors hover:border-white/10 hover:bg-slate-800/80 focus-visible:border-cyan-300/70 focus-visible:ring-2 focus-visible:ring-cyan-300/30 disabled:pointer-events-none disabled:opacity-50"
      >
        <span className="text-sm leading-none">X</span>
      </button>
      <button
        type="button"
        disabled={disabled || (annotations.length === 0 && !draftAnnotation)}
        onPointerDown={stopToolbarEvent}
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onTouchStart={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          handleClearAll();
        }}
        className="h-8 touch-manipulation rounded-full border border-transparent bg-transparent px-2 text-xs text-cyan-50 outline-none transition-colors hover:border-white/10 hover:bg-slate-800/80 focus-visible:border-cyan-300/70 focus-visible:ring-2 focus-visible:ring-cyan-300/30 disabled:pointer-events-none disabled:opacity-50"
      >
        Clear
      </button>
    </div>
  );

  return (
    <div
      className={cn('absolute inset-0 touch-none select-none', className)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {renderToolbar ? (
        renderToolbar(toolbar)
      ) : (
        <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2">{toolbar}</div>
      )}

      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 size-full"
        aria-hidden
      >
        {annotations.map((annotation) => (
          <g key={annotation.id}>
            <AnnotationPreview
              annotation={annotation}
              selected={selectedAnnotationId === annotation.id}
              coarsePointer={coarsePointer}
            />
          </g>
        ))}
        {draftAnnotation && hasUsableAnnotation(draftAnnotation, getBounds()) ? (
          <AnnotationPreview annotation={draftAnnotation} coarsePointer={coarsePointer} />
        ) : null}
      </svg>
    </div>
  );
}
