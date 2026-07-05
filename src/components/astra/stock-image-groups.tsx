'use client';

/* eslint-disable @next/next/no-img-element */

import type { StockImage, StockImageGroup, StockImageLayout } from '@/lib/visuals/stock-images';

interface StockImageGroupsProps {
  groups: StockImageGroup[];
}

function srcSetForImage(image: StockImage): string | undefined {
  const candidates = [
    image.sources.medium ? `${image.sources.medium} 700w` : '',
    image.sources.large ? `${image.sources.large} 940w` : '',
    image.sources.landscape ? `${image.sources.landscape} 1200w` : '',
  ].filter(Boolean);

  return candidates.length > 0 ? candidates.join(', ') : undefined;
}

function sizesForLayout(layout: StockImageLayout): string {
  switch (layout) {
    case 'single':
      return '(min-width: 768px) 40rem, 92vw';
    case 'comparison':
      return '(min-width: 768px) 20rem, 92vw';
    case 'grid':
      return '(min-width: 768px) 18rem, (min-width: 380px) 46vw, 92vw';
    case 'sequence':
      return '(min-width: 768px) 32rem, 92vw';
  }
}

function imageAspectClass(layout: StockImageLayout): string {
  switch (layout) {
    case 'single':
      return 'aspect-[16/9]';
    case 'comparison':
      return 'aspect-[4/3]';
    case 'grid':
      return 'aspect-square';
    case 'sequence':
      return 'aspect-[5/3]';
  }
}

function groupLayoutClass(layout: StockImageLayout, imageCount: number): string {
  if (layout === 'single' || imageCount === 1) return 'space-y-3';
  if (layout === 'sequence') return 'space-y-3';
  if (layout === 'comparison') return 'grid gap-3 md:grid-cols-2';
  return 'grid grid-cols-1 gap-3 min-[380px]:grid-cols-2';
}

function imageAlt(image: StockImage): string {
  return image.alt || image.caption || 'Pexels reference photo';
}

function StockImageCard({
  image,
  layout,
  index,
  numbered,
}: {
  image: StockImage;
  layout: StockImageLayout;
  index: number;
  numbered: boolean;
}) {
  const srcSet = srcSetForImage(image);

  return (
    <figure className="overflow-hidden rounded-xl border border-cyan-400/15 bg-slate-900/50">
      <div
        className={`${imageAspectClass(layout)} relative overflow-hidden bg-slate-900`}
        style={image.avgColor ? { backgroundColor: image.avgColor } : undefined}
      >
        {numbered ? (
          <span className="absolute left-2 top-2 z-10 rounded-full bg-slate-950/80 px-2 py-0.5 text-xs font-semibold text-cyan-100">
            {index + 1}
          </span>
        ) : null}
        <img
          src={image.src}
          srcSet={srcSet}
          sizes={sizesForLayout(layout)}
          width={image.width}
          height={image.height}
          alt={imageAlt(image)}
          loading="lazy"
          decoding="async"
          className="size-full object-cover transition-transform duration-300 hover:scale-[1.02]"
        />
      </div>
      <figcaption className="px-3 py-2">
        <p className="text-xs leading-relaxed text-slate-400">
          Photo: {image.photographer} / Pexels
        </p>
      </figcaption>
    </figure>
  );
}

function StockImageGroupView({ group }: { group: StockImageGroup }) {
  const numbered = group.layout === 'sequence';

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-cyan-100">{group.title}</h3>
        <span className="shrink-0 rounded-full border border-cyan-400/15 px-2 py-0.5 text-[0.65rem] uppercase tracking-wide text-slate-400">
          {group.intent}
        </span>
      </div>
      <div className={groupLayoutClass(group.layout, group.images.length)}>
        {group.images.map((image, index) => (
          <StockImageCard
            key={`${group.id}-${image.id}-${index}`}
            image={image}
            layout={group.layout}
            index={index}
            numbered={numbered}
          />
        ))}
      </div>
    </section>
  );
}

export function StockImageGroups({ groups }: StockImageGroupsProps) {
  if (groups.length === 0) return null;

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <StockImageGroupView key={group.id} group={group} />
      ))}
    </div>
  );
}
