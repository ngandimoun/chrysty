export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

type Edge = 'left' | 'right' | 'top' | 'bottom';

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function pickSpawnEdge(target: Point, container: Size): Edge {
  const distLeft = target.x;
  const distRight = container.width - target.x;
  const distTop = target.y;
  const distBottom = container.height - target.y;
  const min = Math.min(distLeft, distRight, distTop, distBottom);
  if (min === distLeft) return 'left';
  if (min === distRight) return 'right';
  if (min === distTop) return 'top';
  return 'bottom';
}

export function spawnPoint(edge: Edge, container: Size, margin = 52): Point {
  switch (edge) {
    case 'left':
      return { x: -margin, y: container.height * 0.45 };
    case 'right':
      return { x: container.width + margin, y: container.height * 0.45 };
    case 'top':
      return { x: container.width * 0.5, y: -margin };
    case 'bottom':
      return { x: container.width * 0.5, y: container.height + margin };
  }
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

export function sampleQuadraticBezier(p0: Point, p1: Point, p2: Point, steps = 36): Point[] {
  const points: Point[] = [];
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const u = 1 - t;
    points.push({
      x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
      y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
    });
  }
  return points;
}

export function buildEntryFlightPath(from: Point, to: Point): Point[] {
  const span = distance(from, to);
  const arcHeight = Math.min(80, span * 0.22);
  const control: Point = {
    x: (from.x + to.x) / 2,
    y: (from.y + to.y) / 2 - arcHeight,
  };
  return sampleQuadraticBezier(from, control, to);
}

export function buildFlightKeyframes(
  target: Point,
  container: Size,
  reverse = false,
): { points: Point[]; durationMs: number } {
  const edge = pickSpawnEdge(target, container);
  const start = spawnPoint(edge, container);
  const forward = buildEntryFlightPath(start, target);
  const points = reverse ? [...forward].reverse() : forward;
  const durationMs = Math.min(1400, Math.max(600, distance(start, target) * 1.4));
  return { points, durationMs };
}

export function tangentAngleAt(points: Point[], progress: number): number {
  const index = Math.min(points.length - 2, Math.max(0, Math.floor(progress * (points.length - 1))));
  const current = points[index] ?? points[0];
  const next = points[index + 1] ?? current;
  return (Math.atan2(next.y - current.y, next.x - current.x) * 180) / Math.PI + 90;
}

export function pointAlongPath(points: Point[], progress: number): Point {
  const clamped = Math.min(1, Math.max(0, progress));
  const scaled = clamped * (points.length - 1);
  const lower = Math.floor(scaled);
  const upper = Math.min(points.length - 1, lower + 1);
  const t = scaled - lower;
  const a = points[lower] ?? points[0];
  const b = points[upper] ?? a;
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

export function animateAlongPath(
  points: Point[],
  durationMs: number,
  onFrame: (point: Point, progress: number, angle: number) => void,
  onDone?: () => void,
): () => void {
  const startedAt = performance.now();
  let frame = 0;

  const tick = (now: number) => {
    const raw = Math.min(1, (now - startedAt) / durationMs);
    const progress = smoothstep(raw);
    const point = pointAlongPath(points, progress);
    const angle = tangentAngleAt(points, progress);
    onFrame(point, progress, angle);
    if (raw < 1) {
      frame = requestAnimationFrame(tick);
    } else {
      onDone?.();
    }
  };

  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}
