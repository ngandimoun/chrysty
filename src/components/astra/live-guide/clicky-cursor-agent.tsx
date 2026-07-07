'use client';

import { useEffect, useRef, useState } from 'react';

import {
  animateAlongPath,
  buildFlightKeyframes,
  type Point,
  type Size,
} from '@/components/astra/live-guide/bezier-path';

interface ClickyCursorAgentProps {
  target: Point;
  container: Size;
  stroke: string;
  glow: string;
  onLanded?: () => void;
}

export function ClickyCursorAgent({
  target,
  container,
  stroke,
  glow,
  onLanded,
}: ClickyCursorAgentProps) {
  const [position, setPosition] = useState<Point | null>(null);
  const [rotation, setRotation] = useState(-35);
  const [scale, setScale] = useState(0.6);
  const landedRef = useRef(false);

  useEffect(() => {
    landedRef.current = false;
    const { points, durationMs } = buildFlightKeyframes(target, container, false);
    const cancel = animateAlongPath(
      points,
      durationMs,
      (point, progress, angle) => {
        setPosition(point);
        setRotation(angle);
        setScale(1 + Math.sin(progress * Math.PI) * 0.28);
      },
      () => {
        if (!landedRef.current) {
          landedRef.current = true;
          setPosition(target);
          setRotation(-35);
          setScale(1);
          onLanded?.();
        }
      },
    );
    return cancel;
  }, [container.height, container.width, onLanded, target.x, target.y]);

  if (!position) return null;

  return (
    <g
      transform={`translate(${position.x.toFixed(1)} ${position.y.toFixed(1)}) rotate(${rotation}) scale(${scale})`}
    >
      <polygon
        points="0,-14 10,8 -10,8"
        fill={stroke}
        stroke="rgba(8,15,30,0.8)"
        strokeWidth={2}
        style={{ filter: `drop-shadow(0 0 10px ${glow})` }}
      />
      <circle cx={0} cy={-2} r={3} fill="rgba(8,15,30,0.35)" />
    </g>
  );
}
