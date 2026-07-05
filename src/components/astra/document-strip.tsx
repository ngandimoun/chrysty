'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { FileText, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { ReferenceDocumentItem } from '@/hooks/use-reference-documents';
import { MAX_REFERENCE_DOCUMENTS } from '@/lib/documents/types';
import { cn } from '@/lib/utils';

interface DocumentStripProps {
  documents: ReferenceDocumentItem[];
  onRemove: (id: string) => void;
  className?: string;
}

function truncateName(name: string, max = 18): string {
  if (name.length <= max) return name;
  const extension = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';
  const base = name.slice(0, max - extension.length - 1);
  return `${base}…${extension}`;
}

export function DocumentStrip({ documents, onRemove, className }: DocumentStripProps) {
  if (documents.length === 0) {
    return null;
  }

  return (
    <div className={cn('flex w-full flex-col gap-2', className)}>
      <div className="flex w-full items-center justify-between px-1">
        <p className="text-xs font-medium tracking-wide text-muted-foreground">Saved documents</p>
        <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs tabular-nums text-foreground">
          {documents.length} / {MAX_REFERENCE_DOCUMENTS}
        </span>
      </div>

      <div className="flex w-full flex-col gap-2">
        <AnimatePresence mode="popLayout">
          {documents.map((document) => (
            <motion.div
              key={document.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2"
            >
              <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
                {document.kind === 'image' && document.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={document.previewUrl}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : (
                  <FileText className="size-5 text-muted-foreground" aria-hidden />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground" title={document.name}>
                  {truncateName(document.name)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {document.kind === 'pdf' ? 'PDF' : 'Image'}
                </p>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => onRemove(document.id)}
                aria-label={`Remove ${document.name}`}
                className="shrink-0 rounded-full border border-border bg-card text-foreground hover:bg-accent"
              >
                <X className="size-3" />
              </Button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
