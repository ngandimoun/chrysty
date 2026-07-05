'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { GeneratedDocumentList } from '@/components/astra/generated-document-list';
import type { GeneratedDocumentItem } from '@/hooks/use-generated-documents';
import type { BackgroundJobClientItem } from '@/lib/background-jobs/types';
import { cn } from '@/lib/utils';

interface DocumentsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documents: GeneratedDocumentItem[];
  backgroundJobs?: BackgroundJobClientItem[];
  isLoading?: boolean;
  loadError?: string | null;
  onSelectDocument: (id: string) => void;
  onRemoveDocument: (id: string) => void;
}

export function DocumentsSheet({
  open,
  onOpenChange,
  documents,
  backgroundJobs = [],
  isLoading,
  loadError,
  onSelectDocument,
  onRemoveDocument,
}: DocumentsSheetProps) {
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!open) setSearchQuery('');
  }, [open]);

  const { unreadCount, totalCount } = useMemo(() => {
    const unread = documents.filter((doc) => !doc.readAt).length;
    return { unreadCount: unread, totalCount: documents.length };
  }, [documents]);

  const handleSelect = (id: string) => {
    onSelectDocument(id);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton
        className={cn(
          'max-h-[min(88dvh,40rem)] rounded-t-3xl border-border bg-popover text-popover-foreground',
          'pb-[max(1rem,env(safe-area-inset-bottom))]',
        )}
      >
        <SheetHeader className="gap-3 px-1 pt-1">
          <div className="flex items-start justify-between gap-3">
            <SheetTitle>Documents</SheetTitle>
            {!isLoading && totalCount > 0 ? (
              <p className="shrink-0 pt-0.5 text-xs text-muted-foreground">
                {unreadCount > 0 ? (
                  <>
                    <span className="font-medium text-foreground">{unreadCount} new</span>
                    <span className="text-muted-foreground"> · </span>
                  </>
                ) : null}
                <span>{totalCount} total</span>
              </p>
            ) : null}
          </div>
          {loadError ? (
            <p className="text-sm text-rose-300">{loadError}</p>
          ) : null}
          {!isLoading && totalCount > 0 ? (
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search documents"
                aria-label="Search documents"
                className="h-9 border-input bg-background pl-9 text-foreground placeholder:text-muted-foreground"
              />
            </div>
          ) : null}
        </SheetHeader>

        <div className="flex flex-1 flex-col overflow-y-auto px-1 pb-2">
          <GeneratedDocumentList
            documents={documents}
            backgroundJobs={backgroundJobs}
            isLoading={isLoading}
            searchQuery={searchQuery}
            onSelect={handleSelect}
            onRemove={onRemoveDocument}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
