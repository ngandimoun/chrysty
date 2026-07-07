'use client';

import { motion } from 'framer-motion';

import type { VisualGuidanceResponse } from '@/lib/gemini/voice-response-schema';
import type { GuidanceImage } from '@/lib/streaming/types';
import { cn } from '@/lib/utils';

interface VisualGuidanceGalleryProps {
  images: GuidanceImage[];
  guidance?: VisualGuidanceResponse | null;
  /**
   * When true, other guidance (e.g. a physical-task panel or explanation text) is shown
   * alongside this gallery, so the "no annotation returned" banner is suppressed to avoid
   * a misleading "nothing available" impression.
   */
  hasCompanionGuidance?: boolean;
}

function pct(value: number | undefined, fallback = 0): string {
  return `${((value ?? fallback) * 100).toFixed(3)}%`;
}

function overlayBelongsToImage(imageId: string, overlayImageId?: string, primaryImageId?: string): boolean {
  if (overlayImageId) return overlayImageId === imageId;
  return primaryImageId ? primaryImageId === imageId : true;
}

function itemBelongsToImage(imageId: string, itemImageId?: string, primaryImageId?: string): boolean {
  if (itemImageId) return itemImageId === imageId;
  return primaryImageId ? primaryImageId === imageId : true;
}

export function VisualGuidanceGallery({
  images,
  guidance,
  hasCompanionGuidance = false,
}: VisualGuidanceGalleryProps) {
  if (images.length === 0) return null;

  const primaryImageId = guidance?.primary_image_id ?? images[0]?.id;
  const orderedImages = [
    ...images.filter((image) => image.id === primaryImageId),
    ...images.filter((image) => image.id !== primaryImageId),
  ];
  const activeCard = guidance?.cards.find((card) => card.id === guidance.active_card_id);
  const cards = guidance?.cards ?? [];
  const hasGuidanceContent =
    (guidance?.scene_items.length ?? 0) > 0 ||
    (guidance?.overlays.length ?? 0) > 0 ||
    cards.length > 0 ||
    (guidance?.differences.length ?? 0) > 0;

  return (
    <div className="space-y-3">
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:-mx-5 sm:px-5">
        {orderedImages.map((image, imageIndex) => {
          const imageItems =
            guidance?.scene_items.filter((item) => itemBelongsToImage(image.id, item.image_id, primaryImageId)) ?? [];
          const imageOverlays =
            guidance?.overlays.filter((overlay) => overlayBelongsToImage(image.id, overlay.image_id, primaryImageId)) ??
            [];

          return (
            <article
              key={image.id}
              className="w-[min(82vw,22rem)] shrink-0 snap-center overflow-hidden rounded-2xl border border-cyan-400/15 bg-slate-950/70 shadow-[0_18px_50px_rgba(0,0,0,0.28)]"
            >
              <div
                className="relative overflow-hidden bg-slate-900"
                style={{ aspectRatio: `${image.width || 4} / ${image.height || 3}` }}
              >
                {/* Captures are short-lived blob URLs, so Next Image optimization is not useful here. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.url}
                  alt={`User capture ${imageIndex + 1}`}
                  className="size-full object-fill"
                />
                <svg className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                  {imageOverlays
                    .slice()
                    .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
                    .map((overlay) => {
                      const motionProps = {
                        initial: { opacity: 0, scale: 0.98 },
                        animate: { opacity: 1, scale: 1 },
                        transition: { duration: 0.22, delay: Math.min((overlay.sequence ?? 0) * 0.05, 0.45) },
                      };

                      if (overlay.type === 'arrow' || overlay.type === 'line') {
                        const from = overlay.from ?? { x: overlay.x ?? 0.5, y: overlay.y ?? 0.5 };
                        const to = overlay.to ?? {
                          x: (overlay.x ?? 0.5) + (overlay.width ?? 0.12),
                          y: (overlay.y ?? 0.5) + (overlay.height ?? 0.02),
                        };
                        return (
                          <motion.g key={overlay.id} {...motionProps}>
                            <line
                              x1={from.x * 100}
                              y1={from.y * 100}
                              x2={to.x * 100}
                              y2={to.y * 100}
                              stroke="rgba(8,15,30,0.82)"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                            />
                            <line
                              x1={from.x * 100}
                              y1={from.y * 100}
                              x2={to.x * 100}
                              y2={to.y * 100}
                              stroke="#67e8f9"
                              strokeWidth="0.7"
                              strokeLinecap="round"
                            />
                          </motion.g>
                        );
                      }

                      if (overlay.type === 'path' && overlay.points && overlay.points.length >= 2) {
                        const points = overlay.points.map((point) => `${point.x * 100},${point.y * 100}`).join(' ');
                        return (
                          <motion.polyline
                            key={overlay.id}
                            {...motionProps}
                            points={points}
                            fill="none"
                            stroke="#67e8f9"
                            strokeWidth="0.7"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        );
                      }

                      if (overlay.type === 'spotlight' || overlay.type === 'mask') {
                        return (
                          <motion.rect
                            key={overlay.id}
                            {...motionProps}
                            x={overlay.x ? overlay.x * 100 : 0}
                            y={overlay.y ? overlay.y * 100 : 0}
                            width={(overlay.width ?? 1) * 100}
                            height={(overlay.height ?? 1) * 100}
                            rx="2"
                            fill="rgba(103,232,249,0.12)"
                            stroke="rgba(103,232,249,0.45)"
                            strokeWidth="0.4"
                          />
                        );
                      }

                      return (
                        <motion.rect
                          key={overlay.id}
                          {...motionProps}
                          x={(overlay.x ?? 0) * 100}
                          y={(overlay.y ?? 0) * 100}
                          width={(overlay.width ?? 0.1) * 100}
                          height={(overlay.height ?? 0.1) * 100}
                          rx="2"
                          fill={overlay.type === 'ghost' ? 'rgba(103,232,249,0.12)' : 'transparent'}
                          stroke={overlay.type === 'warning' ? '#f59e0b' : overlay.type === 'check' ? '#34d399' : '#67e8f9'}
                          strokeWidth="0.55"
                          strokeDasharray={overlay.type === 'ghost' ? '1.8 1.2' : undefined}
                        />
                      );
                    })}
                </svg>

                {imageItems.map((item, index) => {
                  const point = item.point ?? (item.bbox ? { x: item.bbox.x, y: item.bbox.y } : undefined);
                  if (!point) return null;
                  return (
                    <motion.div
                      key={item.item_id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(index * 0.04, 0.4) }}
                      className="absolute flex max-w-36 items-center gap-1 rounded-full border border-cyan-200/25 bg-slate-950/80 px-1.5 py-1 text-[0.65rem] font-medium text-cyan-50 shadow-lg backdrop-blur"
                      style={{ left: pct(point.x), top: pct(point.y), transform: 'translate(-50%, -50%)' }}
                    >
                      {item.display_number ? (
                        <span className="grid size-5 place-items-center rounded-full bg-cyan-300 text-[0.65rem] font-bold text-slate-950">
                          {item.display_number}
                        </span>
                      ) : null}
                      <span className="truncate">{item.name}</span>
                    </motion.div>
                  );
                })}

                {imageOverlays
                  .filter((overlay) => overlay.label && overlay.type !== 'line' && overlay.type !== 'path')
                  .map((overlay, index) => {
                    const anchorX =
                      overlay.x !== undefined
                        ? (overlay.x ?? 0) + (overlay.width ?? 0) / 2
                        : overlay.from?.x ?? 0.5;
                    const anchorY =
                      overlay.y !== undefined
                        ? overlay.y ?? 0
                        : overlay.from?.y ?? 0.5;

                    return (
                      <motion.div
                        key={`${overlay.id}-label`}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: Math.min(index * 0.04 + 0.08, 0.5) }}
                        className="absolute max-w-[42%] truncate rounded-full border border-cyan-200/30 bg-slate-950/85 px-2 py-0.5 text-[0.62rem] font-medium text-cyan-50 shadow-md backdrop-blur"
                        style={{
                          left: pct(anchorX),
                          top: pct(Math.max(anchorY - 0.03, 0.02)),
                          transform: 'translate(-50%, -100%)',
                        }}
                      >
                        {overlay.label}
                      </motion.div>
                    );
                  })}
              </div>

              <div className="space-y-2 p-3">
                <div className="flex items-center justify-between gap-2 text-[0.7rem] uppercase tracking-wide text-slate-400">
                  <span>Photo {imageIndex + 1}</span>
                  {image.id === primaryImageId ? <span className="text-cyan-200">Primary</span> : null}
                </div>
                {imageItems.length > 0 ? (
                  <p className="line-clamp-2 text-sm text-slate-300">
                    {imageItems
                      .slice(0, 4)
                      .map((item) => `${item.display_number ? `${item.display_number}. ` : ''}${item.name}`)
                      .join('  ')}
                  </p>
                ) : (
                  <p className="text-sm text-slate-400">
                    {hasGuidanceContent ? 'Context image' : 'No reliable visual marks were returned for this photo.'}
                  </p>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {cards.length > 0 ? (
        <div className="space-y-2">
          {(activeCard ? [activeCard, ...cards.filter((card) => card.id !== activeCard.id)] : cards)
            .slice(0, 8)
            .map((card) => (
              <div
                key={card.id}
                className={cn(
                  'rounded-xl border bg-slate-950/55 p-3',
                  card.id === guidance?.active_card_id
                    ? 'border-cyan-300/35 shadow-[0_0_28px_rgba(34,211,238,0.12)]'
                    : 'border-cyan-400/10',
                )}
              >
                <div className="flex items-start gap-2">
                  {card.step_number ? (
                    <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-cyan-300 text-xs font-bold text-slate-950">
                      {card.step_number}
                    </span>
                  ) : null}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-100">{card.title}</p>
                    {card.body ? <p className="mt-1 text-sm leading-relaxed text-slate-300">{card.body}</p> : null}
                  </div>
                </div>
              </div>
            ))}
        </div>
      ) : !hasGuidanceContent && !hasCompanionGuidance ? (
        <div className="rounded-xl border border-amber-300/20 bg-amber-500/10 p-3">
          <p className="text-sm font-semibold text-amber-100">Image captured, but no annotation was returned.</p>
          <p className="mt-1 text-sm leading-relaxed text-amber-50/80">
            I can still use the photo for context. Try asking for one specific next action, or take a clearer photo if
            you want precise labels or arrows.
          </p>
        </div>
      ) : null}
    </div>
  );
}
