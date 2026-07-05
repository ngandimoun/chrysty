'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

import {
  GeneratedDocumentCard,
  GeneratedDocumentCardSkeleton,
} from '@/components/astra/generated-document-card';
import type { GeneratedDocumentItem } from '@/hooks/use-generated-documents';
import type { BackgroundJobClientItem } from '@/lib/background-jobs/types';
import { documentMatchesQuery } from '@/lib/documents/document-content';
import {
  groupDocumentsIntoCollections,
  type DocumentCollection,
} from '@/lib/documents/document-collections';
import { cn } from '@/lib/utils';

const GRID_CLASS = 'grid grid-cols-2 gap-3 sm:grid-cols-3';

interface GeneratedDocumentListProps {
  documents: GeneratedDocumentItem[];
  backgroundJobs?: BackgroundJobClientItem[];
  isLoading?: boolean;
  searchQuery?: string;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  className?: string;
}

function CollectionHeader({
  label,
  documentCount,
  unreadCount,
  expanded,
  onToggle,
}: {
  label: string;
  documentCount: number;
  unreadCount: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="sticky top-0 z-10 -mx-1 w-full border-b border-border bg-popover px-1 py-2 text-left transition-colors hover:bg-accent/50"
    >
      <div className="flex items-center gap-2">
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
      </div>
    </button>
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
}: {
  collection: DocumentCollection;
  expanded: boolean;
  onToggle: () => void;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <section className="flex flex-col gap-3">
      <CollectionHeader
        label={collection.label}
        documentCount={collection.documents.length}
        unreadCount={collection.unreadCount}
        expanded={expanded}
        onToggle={onToggle}
      />
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
        />
      ))}
    </div>
  );
}
