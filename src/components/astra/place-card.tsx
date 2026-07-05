'use client';

import { ExternalLink, MapPin } from 'lucide-react';

import type { PlaceCard as PlaceCardData } from '@/lib/streaming/types';

interface PlaceCardProps {
  place: PlaceCardData;
  index: number;
}

export function PlaceCard({ place, index }: PlaceCardProps) {
  return (
    <article className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
          {index + 1}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-base font-medium leading-snug text-foreground">{place.name}</h3>
            <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </div>

          {place.reviewSnippet ? (
            <p className="text-sm leading-relaxed text-muted-foreground">&ldquo;{place.reviewSnippet}&rdquo;</p>
          ) : null}

          {place.url ? (
            <a
              href={place.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary transition-opacity hover:opacity-80"
            >
              Open in Google Maps
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
}
