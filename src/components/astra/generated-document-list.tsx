'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Combine } from 'lucide-react';

import {
  GeneratedDocumentCard,
  GeneratedDocumentCardSkeleton,
} from '@/components/astra/generated-document-card';
import type { GeneratedDocumentItem } from '@/hooks/use-generated-documents';
import type { BackgroundJobClientItem } from '@/lib/background-jobs/types';
import { isRemotePersistenceEnabled } from '@/lib/astra/api-client';
import {
  confirmRemoteDocumentMerge,
  previewRemoteDocumentMerge,
} from '@/lib/astra/generated-document-remote';
import { documentMatchesQuery } from '@/lib/documents/document-content';
import {
  groupDocumentsIntoCollections,
  type DocumentCollection,
} from '@/lib/documents/document-collections';
import { cn } from '@/lib/utils';
import type { DocumentMergePreview } from '@/lib/documents/living-document';

const GRID_CLASS = 'grid grid-cols-2 gap-3 sm:grid-cols-3';

interface GeneratedDocumentListProps {
  documents: GeneratedDocumentItem[];
  backgroundJobs?: BackgroundJobClientItem[];
  isLoading?: boolean;
  searchQuery?: string;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onMerged?: () => void | Promise<void>;
  className?: string;
}

function CollectionHeader({
  label,
  documentCount,
  unreadCount,
  expanded,
  onToggle,
  onMerge,
  canMerge,
}: {
  label: string;
  documentCount: number;
  unreadCount: number;
  expanded: boolean;
  onToggle: () => void;
  onMerge?: () => void;
  canMerge: boolean;
}) {
  return (
    <div className="sticky top-0 z-10 -mx-1 flex w-full items-center border-b border-border bg-popover px-1 py-2">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex min-w-0 flex-1 items-center gap-2 text-left transition-colors hover:text-primary"
      >
        <ChevronDown
          className={cn(
            'size-4 shrink-0 text-muted-foreground transition-transform duration-200',
            expanded ? 'rotate-0' : '-rotate-90',
          )}
          aria-hidden
        />
        <p className="min-w-0 flex-1 text-sm font-semibold text-foreground">{label}</p>
        <p className="shrink-0 text-[11px] text-muted-foreground">
          {documentCount} doc{documentCount === 1 ? '' : 's'}
        </p>
        {unreadCount > 0 ? (
          <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
            {unreadCount} new
          </span>
        ) : null}
      </button>
      {canMerge ? (
        <button
          type="button"
          onClick={onMerge}
          className="ml-2 inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label={`Merge documents in ${label}`}
        >
          <Combine className="size-3" aria-hidden />
          Merge
        </button>
      ) : null}
    </div>
  );
}

function DocumentCardMotion({
  document,
  onSelect,
  onRemove,
}: {
  document: GeneratedDocumentItem;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <motion.div
      layout
      className="min-w-0"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      <GeneratedDocumentCard document={document} onSelect={onSelect} onRemove={onRemove} />
    </motion.div>
  );
}

function DocumentGrid({
  documents,
  onSelect,
  onRemove,
}: {
  documents: GeneratedDocumentItem[];
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className={GRID_CLASS}>
      <AnimatePresence mode="popLayout">
        {documents.map((document) => (
          <DocumentCardMotion
            key={document.id}
            document={document}
            onSelect={onSelect}
            onRemove={onRemove}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

function CollectionSection({
  collection,
  expanded,
  onToggle,
  onSelect,
  onRemove,
  onMerged,
}: {
  collection: DocumentCollection;
  expanded: boolean;
  onToggle: () => void;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onMerged?: () => void | Promise<void>;
}) {
  const [mergePreview, setMergePreview] = useState<DocumentMergePreview | null>(null);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [isMerging, setIsMerging] = useState(false);
  const canMerge =
    isRemotePersistenceEnabled() &&
    collection.documents.length > 1 &&
    collection.documents.every((document) => document.kind === 'text');

  const previewMerge = async () => {
    setMergeError(null);
    try {
      setMergePreview(await previewRemoteDocumentMerge(collection.documents.map((document) => document.id)));
    } catch (error) {
      setMergeError(error instanceof Error ? error.message : 'Could not preview merge.');
    }
  };

  const confirmMerge = async () => {
    if (!mergePreview) return;
    setIsMerging(true);
    setMergeError(null);
    try {
      await confirmRemoteDocumentMerge(mergePreview);
      setMergePreview(null);
      await onMerged?.();
    } catch (error) {
      setMergeError(error instanceof Error ? error.message : 'Could not merge documents.');
    } finally {
      setIsMerging(false);
    }
  };

  return (
    <section className="flex flex-col gap-3">
      <CollectionHeader
        label={collection.label}
        documentCount={collection.documents.length}
        unreadCount={collection.unreadCount}
        expanded={expanded}
        onToggle={onToggle}
        canMerge={canMerge}
        onMerge={() => void previewMerge()}
      />
      {mergePreview ? (
        <div className="rounded-lg border border-border bg-background p-3 text-xs">
          <p className="font-medium text-foreground">Merge preview</p>
          <p className="mt-1 text-muted-foreground">
            Combine {collection.documents.length} documents into “{mergePreview.title}”. The originals
            become named sections; provenance and revisions are retained in the audit metadata.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => setMergePreview(null)} className="rounded px-2 py-1">
              Cancel
            </button>
            <button
              type="button"
              disabled={isMerging}
              onClick={() => void confirmMerge()}
              className="rounded bg-primary px-2 py-1 font-medium text-primary-foreground disabled:opacity-50"
            >
              {isMerging ? 'Merging…' : 'Confirm merge'}
            </button>
          </div>
        </div>
      ) : null}
      {mergeError ? <p className="text-xs text-destructive">{mergeError}</p> : null}
      {expanded ? (
        <DocumentGrid
          documents={collection.documents}
          onSelect={onSelect}
          onRemove={onRemove}
        />
      ) : null}
    </section>
  );
}

function buildInitialCollapsedIds(collections: DocumentCollection[]): Set<string> {
  return new Set(collections.filter((collection) => collection.unreadCount === 0).map((c) => c.id));
}

export function GeneratedDocumentList({
  documents,
  backgroundJobs = [],
  isLoading = false,
  searchQuery = '',
  onSelect,
  onRemove,
  onMerged,
  className,
}: GeneratedDocumentListProps) {
  const filteredDocuments = useMemo(() => {
    if (!searchQuery.trim()) return documents;
    return documents.filter((document) => documentMatchesQuery(document, searchQuery));
  }, [documents, searchQuery]);

  const collections = useMemo(
    () => groupDocumentsIntoCollections(filteredDocuments, backgroundJobs),
    [filteredDocuments, backgroundJobs],
  );

  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() =>
    buildInitialCollapsedIds(collections),
  );

  const toggleCollection = (collectionId: string) => {
    setCollapsedIds((current) => {
      const next = new Set(current);
      if (next.has(collectionId)) {
        next.delete(collectionId);
      } else {
        next.add(collectionId);
      }
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className={cn(GRID_CLASS, className)}>
        {Array.from({ length: 6 }).map((_, index) => (
          <GeneratedDocumentCardSkeleton key={index} />
        ))}
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <p className="px-1 text-sm text-muted-foreground">
        No saved creations yet — save from a response using Save.
      </p>
    );
  }

  if (filteredDocuments.length === 0) {
    return (
      <p className="px-1 text-sm text-muted-foreground">
        No documents match your search.
      </p>
    );
  }

  return (
    <div className={cn('flex w-full flex-col gap-5', className)}>
      {collections.map((collection) => (
        <CollectionSection
          key={collection.id}
          collection={collection}
          expanded={!collapsedIds.has(collection.id)}
          onToggle={() => toggleCollection(collection.id)}
          onSelect={onSelect}
          onRemove={onRemove}
          onMerged={onMerged}
        />
      ))}
    </div>
  );
}
