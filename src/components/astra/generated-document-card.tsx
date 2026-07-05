'use client';

import { BarChart3, FileText, Image as ImageIcon, MapPin, Mic, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { GeneratedDocumentItem } from '@/hooks/use-generated-documents';
import type { GeneratedDocumentKind } from '@/lib/documents/generated-document-types';
import { cn } from '@/lib/utils';

interface GeneratedDocumentCardProps {
  document: GeneratedDocumentItem;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}

export function formatDocDate(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

export function getTextPreview(jsonPayload: string | undefined): string | null {
  if (!jsonPayload) return null;
  try {
    const parsed = JSON.parse(jsonPayload) as { fullText?: string };
    const raw = parsed.fullText?.trim();
    if (!raw) return null;
    const plain = raw
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/\*\*|__|\*|_|`/g, '')
      .replace(/\n+/g, ' ')
      .trim();
    return plain.length > 0 ? plain : null;
  } catch {
    return null;
  }
}

export function kindChipStyles(kind: GeneratedDocumentKind, muted: boolean): string {
  const base = muted ? 'opacity-70' : '';
  switch (kind) {
    case 'chart':
      return cn(base, 'border-violet-300/50 bg-violet-100 text-violet-800 dark:border-violet-400/30 dark:bg-violet-500/15 dark:text-violet-200');
    case 'image':
      return cn(base, 'border-pink-300/50 bg-pink-100 text-pink-800 dark:border-pink-400/30 dark:bg-pink-500/15 dark:text-pink-200');
    case 'audio':
      return cn(base, 'border-amber-300/50 bg-amber-100 text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/15 dark:text-amber-200');
    case 'places':
      return cn(base, 'border-emerald-300/50 bg-emerald-100 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-500/15 dark:text-emerald-200');
    default:
      return cn(base, 'border-border bg-muted text-foreground');
  }
}

function KindIcon({ kind, muted }: { kind: GeneratedDocumentKind; muted: boolean }) {
  const className = cn('size-8', muted ? 'text-muted-foreground' : 'text-foreground');
  switch (kind) {
    case 'image':
      return <ImageIcon className={className} aria-hidden />;
    case 'chart':
      return <BarChart3 className={className} aria-hidden />;
    case 'audio':
      return <Mic className={className} aria-hidden />;
    case 'places':
      return <MapPin className={className} aria-hidden />;
    default:
      return <FileText className={className} aria-hidden />;
  }
}

export function GeneratedDocumentCard({ document, onSelect, onRemove }: GeneratedDocumentCardProps) {
  const isUnread = !document.readAt;
  const preview = getTextPreview(document.record.jsonPayload);

  return (
    <div
      className={cn(
        'flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border transition-colors',
        isUnread
          ? 'border-primary/40 bg-primary/5 ring-2 ring-primary/20'
          : 'border-border bg-card',
      )}
    >
      <div className="relative">
        <button
          type="button"
          onClick={() => onSelect(document.id)}
          className="block w-full text-left"
          aria-label={`Open ${document.title}`}
        >
          <div
            className={cn(
              'relative flex aspect-4/3 w-full items-center justify-center overflow-hidden rounded-t-2xl border-b bg-muted',
              isUnread ? 'border-primary/20' : 'border-border opacity-90',
            )}
          >
            {document.kind === 'image' && document.previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={document.previewUrl}
                alt=""
                className={cn('size-full object-cover', !isUnread && 'opacity-75 saturate-75')}
              />
            ) : (
              <KindIcon kind={document.kind} muted={!isUnread} />
            )}

            {isUnread ? (
              <span className="absolute left-2 top-2 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                New
              </span>
            ) : null}
          </div>
        </button>

        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={(event) => {
            event.stopPropagation();
            onRemove(document.id);
          }}
          aria-label={`Remove ${document.title}`}
          className="absolute right-2 top-2 size-7 rounded-full border border-border bg-card text-foreground hover:bg-accent"
        >
          <Trash2 className="size-3" />
        </Button>
      </div>

      <button
        type="button"
        onClick={() => onSelect(document.id)}
        className="flex min-w-0 flex-1 flex-col gap-1.5 p-2.5 text-left"
      >
        <p
          className={cn(
            'line-clamp-2 text-sm leading-snug text-foreground',
            isUnread ? 'font-semibold' : 'font-medium',
          )}
          title={document.title}
        >
          {document.title}
        </p>

        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              'rounded-full border px-1.5 py-0.5 text-[10px] font-medium',
              kindChipStyles(document.kind, !isUnread),
            )}
          >
            {document.kindLabel}
          </span>
          <span className="text-[10px] text-muted-foreground">{formatDocDate(document.createdAt)}</span>
        </div>

        {preview ? (
          <p
            className={cn(
              'line-clamp-2 text-[11px] leading-relaxed text-muted-foreground',
              !isUnread && 'opacity-80',
            )}
          >
            {preview}
          </p>
        ) : null}
      </button>
    </div>
  );
}

export function GeneratedDocumentCardSkeleton() {
  return (
    <div className="animate-pulse overflow-hidden rounded-2xl border border-border bg-card">
      <div className="aspect-4/3 w-full bg-muted" />
      <div className="space-y-2 p-2.5">
        <div className="h-4 w-full rounded bg-muted" />
        <div className="h-3 w-2/3 rounded bg-muted" />
      </div>
    </div>
  );
}
