'use client';

import dynamic from 'next/dynamic';
import { Copy, Download, Pencil, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { DocumentCopyFeedback } from '@/components/astra/document-copy-feedback';
import { DocumentMarkdownToolbar } from '@/components/astra/document-markdown-toolbar';
import { PlaceCard } from '@/components/astra/place-card';
import { StockImageGroups } from '@/components/astra/stock-image-groups';
import { WebSourcesList } from '@/components/astra/web-sources-list';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { GeneratedDocumentItem } from '@/hooks/use-generated-documents';
import { astraFetch, isRemotePersistenceEnabled } from '@/lib/astra/api-client';
import { fetchRemoteGeneratedRecord } from '@/lib/astra/generated-document-remote';
import type { ChartSpec } from '@/lib/charts/types';
import { copyText } from '@/lib/documents/copy-to-clipboard';
import { getDocumentCopyText, getDocumentFullText } from '@/lib/documents/document-content';
import {
  applyMarkdownEdit,
  restoreTextareaSelection,
  type MarkdownEditAction,
} from '@/lib/documents/markdown-editing';
import type {
  GeneratedChartPayload,
  GeneratedImagePayload,
  GeneratedPlacesPayload,
  GeneratedTextPayload,
} from '@/lib/documents/generated-document-types';
import { parseStockImageGroups } from '@/lib/visuals/stock-images';
import { cn } from '@/lib/utils';
import {
  createWorkspaceUiContext,
  type WorkspaceUiContext,
} from '@/lib/live/workspace-context';

const ExplanationChart = dynamic(
  () => import('@/components/astra/explanation-chart').then((mod) => mod.ExplanationChart),
  {
    ssr: false,
    loading: () => (
      <div className="h-60 animate-pulse rounded-xl border border-border bg-muted" />
    ),
  },
);

const RichExplanationContent = dynamic(
  () => import('@/components/astra/rich-explanation-content').then((mod) => mod.RichExplanationContent),
  {
    ssr: false,
    loading: () => (
      <div className="animate-pulse space-y-2">
        <div className="h-4 w-full rounded bg-muted" />
        <div className="h-4 w-5/6 rounded bg-muted" />
      </div>
    ),
  },
);

const CodeExecutionImageView = dynamic(
  () => import('@/components/astra/code-execution-image').then((mod) => mod.CodeExecutionImageView),
  { ssr: false },
);

interface GeneratedDocumentViewerProps {
  document: GeneratedDocumentItem;
  onDismiss: () => void;
  onUpdate?: (id: string, patch: { title?: string; fullText?: string }) => Promise<void>;
  onCopy?: (id: string) => Promise<boolean>;
  onWorkspaceContextChange?: (context: WorkspaceUiContext | null) => void;
}

function parseJson<T>(raw: string | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function sanitizeFilename(title: string): string {
  return title.replace(/[^\w\s.-]+/g, '').trim() || 'document';
}

async function downloadDocument(item: GeneratedDocumentItem, record: GeneratedDocumentItem['record']) {
  const filenameBase = sanitizeFilename(item.title);

  if (isRemotePersistenceEnabled()) {
    const response = await astraFetch(
      `/api/astra/generated-documents/${encodeURIComponent(item.id)}/download`,
    );
    if (!response.ok) throw new Error('Could not download creation');

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const body = (await response.json()) as { jsonPayload?: string };
      const fullText = getDocumentFullText({
        ...record,
        jsonPayload: body.jsonPayload ?? record.jsonPayload,
      });
      const blob = new Blob([fullText || item.title], { type: 'text/markdown;charset=utf-8' });
      triggerDownload(blob, `${filenameBase}.md`);
      return;
    }

    const blob = await response.blob();
    const extension = blob.type.includes('audio') ? '.wav' : blob.type.includes('image') ? '.png' : '';
    triggerDownload(blob, `${filenameBase}${extension}`);
    return;
  }

  if (record.blob) {
    triggerDownload(record.blob, `${filenameBase}`);
    return;
  }

  const fullText = getDocumentFullText(record);
  const blob = new Blob([fullText || item.title], { type: 'text/markdown;charset=utf-8' });
  triggerDownload(blob, `${filenameBase}.md`);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function GeneratedDocumentViewer({
  document,
  onDismiss,
  onUpdate,
  onCopy,
  onWorkspaceContextChange,
}: GeneratedDocumentViewerProps) {
  const [fetchedRecord, setFetchedRecord] = useState<{
    id: string;
    record: GeneratedDocumentItem['record'];
  } | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editMode, setEditMode] = useState<'preview' | 'edit'>('preview');
  const [editTitle, setEditTitle] = useState(document.title);
  const [editBody, setEditBody] = useState(() => getDocumentFullText(document.record));
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);

  const hydratedRecord =
    fetchedRecord?.id === document.id ? fetchedRecord.record : document.record;

  useEffect(() => {
    const needsHydration =
      isRemotePersistenceEnabled() &&
      !document.record.blob &&
      !document.record.jsonPayload &&
      (document.kind === 'audio' ||
        document.kind === 'image' ||
        document.kind === 'text');

    if (!needsHydration) return;

    let cancelled = false;
    void fetchRemoteGeneratedRecord(document.id)
      .then((record) => {
        if (!cancelled) {
          setFetchedRecord({ id: document.id, record });
          if (document.kind === 'text') {
            setEditBody(getDocumentFullText(record));
          }
        }
      })
      .catch(() => {
        // keep metadata-only record
      });

    return () => {
      cancelled = true;
    };
  }, [document]);

  const audioUrl = useMemo(() => {
    if (document.kind !== 'audio' || !hydratedRecord.blob) return null;
    return URL.createObjectURL(hydratedRecord.blob);
  }, [document.kind, hydratedRecord.blob]);

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const imageUrl = useMemo(() => {
    if (document.kind !== 'image' || !hydratedRecord.blob) return null;
    return URL.createObjectURL(hydratedRecord.blob);
  }, [document.kind, hydratedRecord.blob]);

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  const textPayload = parseJson<GeneratedTextPayload>(hydratedRecord.jsonPayload);
  const chartPayload = parseJson<GeneratedChartPayload>(hydratedRecord.jsonPayload);
  const imagePayload = parseJson<GeneratedImagePayload>(hydratedRecord.jsonPayload);
  const placesPayload = parseJson<GeneratedPlacesPayload>(hydratedRecord.jsonPayload);
  const stockImageGroups = parseStockImageGroups(textPayload?.stockImages);

  const savedBody = getDocumentFullText(hydratedRecord);
  const isDirty =
    isEditing &&
    (editTitle.trim() !== document.title.trim() || editBody !== savedBody);
  const canEdit = document.kind === 'text' && Boolean(onUpdate);

  const publishContext = useCallback((selectedPassage = '', fullText = savedBody) => {
    onWorkspaceContextChange?.(createWorkspaceUiContext({
      source: 'generated_document',
      documentId: document.id,
      title: document.title,
      revision: document.record.revision ?? 1,
      selectedPassage,
      fullText,
      saved: true,
      artifactLanguage: document.record.artifactLanguage,
    }));
  }, [
    document.id,
    document.record.revision,
    document.record.artifactLanguage,
    document.title,
    onWorkspaceContextChange,
    savedBody,
  ]);

  useEffect(() => {
    publishContext();
    return () => onWorkspaceContextChange?.(null);
  }, [onWorkspaceContextChange, publishContext]);

  const publishSelection = () => {
    const textarea = textareaRef.current;
    if (textarea && window.document.activeElement === textarea) {
      publishContext(
        editBody.slice(textarea.selectionStart, textarea.selectionEnd),
        editBody,
      );
      return;
    }
    const selection = window.getSelection();
    const node = selection?.anchorNode;
    if (!selection || selection.isCollapsed || !node || !viewerRef.current?.contains(node)) {
      publishContext();
      return;
    }
    publishContext(selection.toString());
  };

  const handleCopy = async () => {
    const success = onCopy
      ? await onCopy(document.id)
      : await copyText(
          getDocumentCopyText({
            ...document,
            record: hydratedRecord,
            title: isEditing ? editTitle : document.title,
          }),
        );
    if (success) setCopied(true);
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      await downloadDocument(document, hydratedRecord);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleStartEdit = () => {
    setEditTitle(document.title);
    setEditBody(savedBody);
    setIsEditing(true);
    setEditMode('edit');
  };

  const handleCancelEdit = () => {
    setEditTitle(document.title);
    setEditBody(savedBody);
    setIsEditing(false);
    setEditMode('preview');
  };

  const handleSave = async () => {
    if (!onUpdate || !isDirty) return;
    setIsSaving(true);
    try {
      await onUpdate(document.id, {
        title: editTitle.trim() || 'Untitled',
        fullText: editBody,
      });
      setIsEditing(false);
      setEditMode('preview');
    } finally {
      setIsSaving(false);
    }
  };

  const handleMarkdownAction = (action: MarkdownEditAction) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const result = applyMarkdownEdit(editBody, {
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
    }, action);

    setEditBody(result.nextValue);
    requestAnimationFrame(() => {
      restoreTextareaSelection(textarea, result.selectionStart, result.selectionEnd);
    });
  };

  return (
    <div className="relative w-full max-w-[min(96vw,28rem)] sm:max-w-md md:max-w-xl lg:max-w-2xl">
      <div className="absolute -right-1 -top-1 z-10 flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => void handleCopy()}
          aria-label="Copy document"
          className="size-9 rounded-full border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Copy className="size-4" aria-hidden />
        </Button>
        {canEdit ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={isEditing ? handleCancelEdit : handleStartEdit}
            aria-label={isEditing ? 'Cancel editing' : 'Edit document'}
            className={cn(
              'size-9 rounded-full border border-border bg-card hover:bg-accent',
              isEditing ? 'text-amber-600 hover:text-amber-700 dark:text-amber-300' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Pencil className="size-4" aria-hidden />
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => void handleDownload()}
          disabled={isDownloading}
          aria-label="Download document"
          className="size-9 rounded-full border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
        >
          <Download className="size-4" aria-hidden />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onDismiss}
          aria-label="Close document"
          className="size-9 rounded-full border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="size-4" aria-hidden />
        </Button>
        <DocumentCopyFeedback copied={copied} className="absolute -bottom-7 right-0" />
      </div>

      <div
        ref={viewerRef}
        onMouseUp={publishSelection}
        onKeyUp={publishSelection}
        className="w-full scroll-smooth
          min-h-[min(72vw,18rem)] max-h-[min(62vh,28rem)]
          sm:min-h-72 sm:max-h-128 md:min-h-80 md:max-h-144
          overflow-y-auto overflow-x-hidden rounded-2xl border border-border
          bg-card p-4 shadow-sm sm:p-5"
        aria-label={`Saved ${document.kindLabel}`}
      >
        {isEditing && canEdit ? (
          <div className="space-y-4">
            <Input
              value={editTitle}
              onChange={(event) => setEditTitle(event.target.value)}
              aria-label="Document title"
              className="border-input bg-background text-foreground"
            />

            <div className="flex gap-1 rounded-lg border border-border bg-muted p-1">
              <button
                type="button"
                onClick={() => setEditMode('preview')}
                className={cn(
                  'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  editMode === 'preview'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                Preview
              </button>
              <button
                type="button"
                onClick={() => setEditMode('edit')}
                className={cn(
                  'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  editMode === 'edit'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                Edit
              </button>
            </div>

            {editMode === 'edit' ? (
              <>
                <DocumentMarkdownToolbar onAction={handleMarkdownAction} />
                <Textarea
                  ref={textareaRef}
                  value={editBody}
                  onChange={(event) => setEditBody(event.target.value)}
                  aria-label="Document body"
                  className="min-h-48 border-white/10 bg-slate-900/70 font-mono text-sm text-cyan-50"
                />
              </>
            ) : (
              <div className="rounded-xl border border-border bg-muted/50 p-3">
                {editBody ? <RichExplanationContent text={editBody} /> : null}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => void handleSave()}
                disabled={!isDirty || isSaving}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {isSaving ? 'Saving…' : 'Save'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleCancelEdit}
                className="border-border bg-transparent text-muted-foreground hover:bg-accent"
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        {!isEditing && document.kind === 'text' && textPayload ? (
          <>
            <h2 className="mb-4 text-lg font-semibold text-foreground">{document.title}</h2>
            {textPayload.fullText ? <RichExplanationContent text={textPayload.fullText} /> : null}
            {stockImageGroups.length > 0 ? (
              <div className={textPayload.fullText ? 'mt-5' : ''}>
                <StockImageGroups groups={stockImageGroups} />
              </div>
            ) : null}
            {textPayload.webCitations && textPayload.webCitations.length > 0 ? (
              <div
                className={
                  textPayload.fullText || stockImageGroups.length > 0
                    ? 'mt-5'
                    : ''
                }
              >
                <WebSourcesList citations={textPayload.webCitations} />
              </div>
            ) : null}
            {textPayload.canvas?.charts.length ? (
              <div className="mt-5 space-y-3">
                {textPayload.canvas.charts.map((chart, index) => (
                  <ExplanationChart key={chart.id ?? `saved-chart-${index}`} chart={chart} index={index} />
                ))}
              </div>
            ) : null}
            {textPayload.canvas?.codeImages.length ? (
              <div className="mt-5 space-y-3">
                {textPayload.canvas.codeImages.map((image, index) => (
                  <CodeExecutionImageView key={`saved-code-image-${index}`} image={image} index={index} />
                ))}
              </div>
            ) : null}
            {textPayload.canvas?.places.length ? (
              <div className="mt-5 space-y-3">
                {textPayload.canvas.places.map((place, index) => (
                  <PlaceCard key={place.placeId ?? place.url ?? `${place.name}-${index}`} place={place} index={index} />
                ))}
              </div>
            ) : null}
          </>
        ) : null}

        {!isEditing && document.kind === 'chart' && chartPayload ? (
          <ExplanationChart chart={chartPayload.chart as ChartSpec} index={0} />
        ) : null}

        {!isEditing && document.kind === 'image' && imageUrl ? (
          <figure className="space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt={imagePayload?.caption ?? document.title}
              className="w-full rounded-xl border border-border object-contain"
            />
            {imagePayload?.caption ? (
              <figcaption className="text-sm text-muted-foreground">{imagePayload.caption}</figcaption>
            ) : null}
          </figure>
        ) : null}

        {!isEditing && document.kind === 'audio' && audioUrl ? (
          <div className="flex flex-col items-center gap-4 py-6">
            <p className="text-sm font-medium text-foreground">{document.title}</p>
            <audio controls src={audioUrl} className="w-full max-w-sm" preload="metadata">
              Your browser does not support audio playback.
            </audio>
          </div>
        ) : null}

        {!isEditing && document.kind === 'places' && placesPayload ? (
          <div className="space-y-3">
            {placesPayload.places.map((place, index) => (
              <PlaceCard key={place.placeId ?? place.url ?? `${place.name}-${index}`} place={place} index={index} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
