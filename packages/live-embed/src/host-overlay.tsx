'use client';

import type { LiveGuideDirective, LiveGuideUpdate } from './types.js';

interface HostGuideOverlayProps {
  directives: LiveGuideDirective[];
  coachingNote?: string | null;
  /** Bounding rect of the capture target on the host page (viewport coords). */
  targetRect: DOMRect | null;
}

function emphasisStroke(emphasis: LiveGuideDirective['emphasis']): string {
  if (emphasis === 'warning') return '#fbbf24';
  if (emphasis === 'secondary') return '#94a3b8';
  return '#38bdf8';
}

function toPixelPoints(
  directive: LiveGuideDirective,
  rect: DOMRect,
): Array<{ x: number; y: number }> {
  return directive.points.map((point) => ({
    x: rect.left + point.x * rect.width,
    y: rect.top + point.y * rect.height,
  }));
}

export function HostGuideOverlay({ directives, coachingNote, targetRect }: HostGuideOverlayProps) {
  if (!targetRect || directives.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[9998]"
      aria-hidden
    >
      <svg className="absolute inset-0 size-full overflow-visible">
        {directives.map((directive) => {
          const points = toPixelPoints(directive, targetRect);
          const stroke = emphasisStroke(directive.emphasis);
          if (directive.kind === 'pointer' && points[0]) {
            const p = points[0];
            return (
              <g key={directive.id}>
                <circle cx={p.x} cy={p.y} r={28} fill="none" stroke={stroke} strokeWidth={2.5} opacity={0.85} />
                <circle cx={p.x} cy={p.y} r={6} fill={stroke} />
              </g>
            );
          }
          if (directive.kind === 'region' && points.length >= 2) {
            const [a, b] = points;
            const x = Math.min(a.x, b.x);
            const y = Math.min(a.y, b.y);
            const w = Math.abs(b.x - a.x);
            const h = Math.abs(b.y - a.y);
            return (
              <rect
                key={directive.id}
                x={x}
                y={y}
                width={w}
                height={h}
                fill={`${stroke}22`}
                stroke={stroke}
                strokeWidth={2}
                rx={8}
              />
            );
          }
          if (directive.kind === 'path' && points.length >= 2) {
            const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
            return (
              <path
                key={directive.id}
                d={d}
                fill="none"
                stroke={stroke}
                strokeWidth={2.5}
                strokeLinecap="round"
              />
            );
          }
          return null;
        })}
      </svg>
      {coachingNote ? (
        <div
          className="absolute max-w-xs rounded-xl border border-border bg-background/95 px-3 py-2 text-xs text-foreground shadow-lg backdrop-blur-sm"
          style={{
            left: Math.min(targetRect.left, window.innerWidth - 280),
            top: Math.max(8, targetRect.top - 48),
          }}
        >
          {coachingNote}
        </div>
      ) : null}
    </div>
  );
}

export function mergeLiveGuideUpdate(
  previous: LiveGuideUpdate | null,
  next: LiveGuideUpdate,
): LiveGuideUpdate {
  if (next.clearPrevious) return next;
  return {
    ...next,
    directives: [...(previous?.directives ?? []), ...next.directives].slice(-12),
  };
}
