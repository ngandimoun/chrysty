'use client';

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

interface PointingBubbleProps {
  anchor: { x: number; y: number };
  label?: string;
  detail?: string;
  spokenText?: string | null;
  sequence?: number;
  stroke: string;
  containerWidth: number;
  isSpeaking?: boolean;
}

export function PointingBubble({
  anchor,
  label,
  detail,
  spokenText,
  sequence,
  stroke,
  containerWidth,
  isSpeaking = false,
}: PointingBubbleProps) {
  const source = spokenText?.trim() || detail?.trim() || label?.trim() || '';
  const [charCount, setCharCount] = useState(() => (isSpeaking ? 0 : source.length));

  useEffect(() => {
    if (!isSpeaking || !source) return;

    let index = 0;
    const interval = window.setInterval(() => {
      index += 1;
      setCharCount(index);
      if (index >= source.length) {
        window.clearInterval(interval);
      }
    }, 38);

    return () => window.clearInterval(interval);
  }, [isSpeaking, source]);

  if (!source && sequence === undefined) return null;

  const visibleText = isSpeaking ? source.slice(0, charCount) : source;
  const placeLeft = anchor.x > containerWidth * 0.55;
  const placeAbove = anchor.y > 72;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.5, y: placeAbove ? 8 : -8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.85 }}
      transition={{ type: 'spring', stiffness: 420, damping: 24, delay: 0.08 }}
      className="pointer-events-none absolute z-20 max-w-[min(14rem,70vw)] rounded-2xl border bg-slate-950/92 px-3 py-2 text-[0.72rem] font-medium leading-snug text-white shadow-[0_8px_28px_rgba(0,0,0,0.45)] backdrop-blur-md"
      style={{
        left: anchor.x,
        top: anchor.y,
        borderColor: `${stroke}55`,
        transform: `translate(${placeLeft ? 'calc(-100% - 20px)' : '20px'}, ${placeAbove ? 'calc(-100% - 24px)' : '24px'})`,
      }}
    >
      <div
        className="absolute size-2.5 rotate-45 border bg-slate-950/92"
        style={{
          borderColor: `${stroke}55`,
          left: placeLeft ? 'auto' : 18,
          right: placeLeft ? 18 : 'auto',
          [placeAbove ? 'bottom' : 'top']: -5,
        }}
      />
      <div className="relative flex items-start gap-2">
        {sequence !== undefined ? (
          <span
            className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[0.62rem] font-bold text-slate-950"
            style={{ backgroundColor: stroke }}
          >
            {sequence}
          </span>
        ) : null}
        <p className="min-w-0">
          {visibleText}
          {isSpeaking && charCount < source.length ? (
            <span className="ml-0.5 inline-block animate-pulse text-cyan-200">|</span>
          ) : null}
        </p>
      </div>
    </motion.div>
  );
}
