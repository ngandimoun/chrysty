'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { isRemotePersistenceEnabled } from '@/lib/astra/api-client';
import { ASTRA_KEY_CHANGED_EVENT } from '@/lib/astra/constants';
import { ensureAstraWorkspaceKeyReady } from '@/lib/astra/workspace-session';
import {
  addRemoteGeneratedDocument,
  fetchRemoteGeneratedRecord,
  listRemoteGeneratedDocuments,
  markRemoteGeneratedDocumentRead,
  removeRemoteGeneratedDocument,
  updateRemoteGeneratedDocument,
  type RemoteGeneratedDocumentMeta,
} from '@/lib/astra/generated-document-remote';
import { pcmToWavBlob } from '@/lib/audio/pcm-to-wav';
import {
  addGeneratedDocument,
  addGeneratedDocuments,
  listGeneratedDocuments,
  markGeneratedDocumentRead,
  removeGeneratedDocument,
  updateGeneratedDocument as updateLocalGeneratedDocument,
} from '@/lib/documents/generated-document-store';
import {
  buildUpdatedTextPayload,
  getDocumentCopyText,
} from '@/lib/documents/document-content';
import { copyText } from '@/lib/documents/copy-to-clipboard';
import {
  GeneratedDocumentError,
  kindLabel,
  type GeneratedDocumentKind,
  type GeneratedDocumentRecord,
} from '@/lib/documents/generated-document-types';
import { explanationToArtifactRecords } from '@/lib/documents/save-explanation-artifacts';
import type { ExplanationState } from '@/lib/streaming/types';

export interface GeneratedDocumentItem {
  id: string;
  title: string;
  kind: GeneratedDocumentKind;
  kindLabel: string;
  createdAt: number;
  updatedAt: number;
  readAt: number | null;
  mimeType?: string;
  previewUrl: string | null;
  jobId?: string | null;
  record: GeneratedDocumentRecord;
}

interface UseGeneratedDocumentsResult {
  documents: GeneratedDocumentItem[];
  count: number;
  unreadCount: number;
  isLoading: boolean;
  error: string | null;
  clearError: () => void;
  saveFromExplanation: (explanation: ExplanationState) => Promise<number>;
  saveAudio: (pcm: Uint8Array, sampleRate: number, title?: string) => Promise<void>;
  markRead: (id: string) => Promise<void>;
  update: (id: string, patch: { title?: string; fullText?: string }) => Promise<void>;
  copyDocumentText: (id: string) => Promise<boolean>;
  remove: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
  getDocument: (id: string) => GeneratedDocumentItem | null;
}

function metaToRecord(meta: RemoteGeneratedDocumentMeta): GeneratedDocumentRecord {
  return {
    id: meta.id,
    kind: meta.kind,
    title: meta.title,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    readAt: meta.readAt ?? null,
    mimeType: meta.mimeType,
    jsonPayload: meta.jsonPayload,
    jobId: meta.jobId ?? null,
    revision: meta.revision,
    sourceKey: meta.sourceKey,
    sourceMetadata: meta.sourceMetadata,
    auditMetadata: meta.auditMetadata,
    artifactLanguage: meta.artifactLanguage,
  };
}

function toItem(record: GeneratedDocumentRecord): GeneratedDocumentItem {
  let previewUrl: string | null = null;
  if (record.kind === 'image' && record.blob) {
    previewUrl = URL.createObjectURL(record.blob);
  } else if (record.kind === 'image' && isRemotePersistenceEnabled()) {
    previewUrl = null;
  }

  return {
    id: record.id,
    title: record.title,
    kind: record.kind,
    kindLabel: kindLabel(record.kind),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt ?? record.createdAt,
    readAt: record.readAt ?? null,
    mimeType: record.mimeType,
    previewUrl,
    jobId: record.jobId ?? null,
    record,
  };
}

export function useGeneratedDocuments(): UseGeneratedDocumentsResult {
  const remoteEnabled = isRemotePersistenceEnabled();
  const [documents, setDocuments] = useState<GeneratedDocumentItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewUrlsRef = useRef<string[]>([]);
  const recordsRef = useRef<Map<string, GeneratedDocumentRecord>>(new Map());

  const revokePreviewUrls = useCallback(() => {
    previewUrlsRef.current.forEach((url) => {
      if (url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    });
    previewUrlsRef.current = [];
  }, []);

  const applyRecords = useCallback(
    (records: GeneratedDocumentRecord[]) => {
      revokePreviewUrls();
      recordsRef.current = new Map(records.map((record) => [record.id, record]));
      const items = records
        .map(toItem)
        .sort((a, b) => b.updatedAt - a.updatedAt || Number(!b.readAt) - Number(!a.readAt));
      previewUrlsRef.current = items
        .map((item) => item.previewUrl)
        .filter((url): url is string => Boolean(url && url.startsWith('blob:')));
      setDocuments(items);
    },
    [revokePreviewUrls],
  );

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      if (remoteEnabled) {
        const metas = await listRemoteGeneratedDocuments();
        applyRecords(metas.map(metaToRecord));
      } else {
        const records = await listGeneratedDocuments();
        applyRecords(records);
      }
    } catch {
      setDocuments([]);
      setError('Could not load saved creations.');
    } finally {
      setIsLoading(false);
    }
  }, [applyRecords, remoteEnabled]);

  useEffect(() => {
    let cancelled = false;

    void ensureAstraWorkspaceKeyReady().then(() => {
      if (!cancelled) void refresh();
    });

    const onKeyChanged = () => {
      if (!cancelled) void refresh();
    };
    window.addEventListener(ASTRA_KEY_CHANGED_EVENT, onKeyChanged);

    return () => {
      cancelled = true;
      window.removeEventListener(ASTRA_KEY_CHANGED_EVENT, onKeyChanged);
      revokePreviewUrls();
    };
  }, [refresh, revokePreviewUrls]);

  const hydrateRecord = useCallback(
    async (id: string): Promise<GeneratedDocumentRecord | null> => {
      const cached = recordsRef.current.get(id);
      if (cached?.blob || cached?.jsonPayload) {
        return cached;
      }
      if (!remoteEnabled) {
        return cached ?? null;
      }
      const record = await fetchRemoteGeneratedRecord(id);
      const hydrated = {
        ...record,
        revision: cached?.revision ?? record.revision,
      };
      recordsRef.current.set(id, hydrated);
      return hydrated;
    },
    [remoteEnabled],
  );

  const applyDocumentPatch = useCallback(
    (id: string, patch: { title?: string; jsonPayload?: string; revision?: number; updatedAt?: number }) => {
      const record = recordsRef.current.get(id);
      if (record) {
        recordsRef.current = new Map(recordsRef.current);
        recordsRef.current.set(id, {
          ...record,
          ...(typeof patch.title === 'string' ? { title: patch.title } : {}),
          ...(typeof patch.jsonPayload === 'string' ? { jsonPayload: patch.jsonPayload } : {}),
          ...(typeof patch.revision === 'number' ? { revision: patch.revision } : {}),
          ...(typeof patch.updatedAt === 'number' ? { updatedAt: patch.updatedAt } : {}),
        });
      }

      setDocuments((current) =>
        current.map((doc) => {
          if (doc.id !== id) return doc;
          const nextRecord = {
            ...doc.record,
            ...(typeof patch.title === 'string' ? { title: patch.title } : {}),
            ...(typeof patch.jsonPayload === 'string' ? { jsonPayload: patch.jsonPayload } : {}),
            ...(typeof patch.revision === 'number' ? { revision: patch.revision } : {}),
            ...(typeof patch.updatedAt === 'number' ? { updatedAt: patch.updatedAt } : {}),
          };
          return {
            ...doc,
            ...(typeof patch.title === 'string' ? { title: patch.title } : {}),
            ...(typeof patch.updatedAt === 'number' ? { updatedAt: patch.updatedAt } : {}),
            record: nextRecord,
          };
        }).sort((a, b) => b.updatedAt - a.updatedAt || Number(!b.readAt) - Number(!a.readAt)),
      );
    },
    [],
  );

  const applyReadAt = useCallback((id: string, readAt: number | null) => {
    const record = recordsRef.current.get(id);
    if (record) {
      recordsRef.current = new Map(recordsRef.current);
      recordsRef.current.set(id, { ...record, readAt });
    }

    setDocuments((current) =>
      current.map((doc) =>
        doc.id === id
          ? {
              ...doc,
              readAt,
              record: {
                ...doc.record,
                readAt,
              },
            }
          : doc,
      ),
    );
  }, []);

  const saveFromExplanation = useCallback(
    async (explanation: ExplanationState): Promise<number> => {
      setError(null);
      try {
        const drafts = explanationToArtifactRecords(explanation);
        if (drafts.length === 0) return 0;

        if (remoteEnabled) {
          for (const draft of drafts) {
            await addRemoteGeneratedDocument(draft);
          }
        } else {
          await addGeneratedDocuments(drafts);
        }

        await refresh();
        return drafts.length;
      } catch (err) {
        const message =
          err instanceof GeneratedDocumentError || err instanceof Error
            ? err.message
            : 'Could not save creations.';
        setError(message);
        throw err;
      }
    },
    [refresh, remoteEnabled],
  );

  const saveAudio = useCallback(
    async (pcm: Uint8Array, sampleRate: number, title = 'Voice response'): Promise<void> => {
      setError(null);
      if (pcm.length === 0) {
        setError('No audio to save.');
        return;
      }

      try {
        const wavBlob = pcmToWavBlob(pcm, sampleRate);
        const draft = {
          kind: 'audio' as const,
          title,
          mimeType: 'audio/wav',
          blob: wavBlob,
          jsonPayload: JSON.stringify({ sampleRate }),
        };

        if (remoteEnabled) {
          await addRemoteGeneratedDocument(draft);
        } else {
          await addGeneratedDocument(draft);
        }

        await refresh();
      } catch (err) {
        const message =
          err instanceof GeneratedDocumentError || err instanceof Error
            ? err.message
            : 'Could not save audio.';
        setError(message);
        throw err;
      }
    },
    [refresh, remoteEnabled],
  );

  const markRead = useCallback(
    async (id: string) => {
      const existing = recordsRef.current.get(id);
      const previousReadAt =
        existing?.readAt ?? documents.find((doc) => doc.id === id)?.readAt ?? null;
      if (previousReadAt) return;

      const readAt = Date.now();
      setError(null);
      applyReadAt(id, readAt);

      try {
        if (remoteEnabled) {
          const meta = await markRemoteGeneratedDocumentRead(id, readAt);
          applyReadAt(id, meta.readAt ?? readAt);
        } else {
          await markGeneratedDocumentRead(id, readAt);
        }
      } catch {
        applyReadAt(id, previousReadAt);
        setError('Could not mark creation as read.');
      }
    },
    [applyReadAt, documents, remoteEnabled],
  );

  const update = useCallback(
    async (id: string, patch: { title?: string; fullText?: string }) => {
      const item = documents.find((doc) => doc.id === id);
      const existing = recordsRef.current.get(id) ?? item?.record;
      if (!existing) {
        setError('Could not update creation.');
        return;
      }

      const previous = {
        title: existing.title,
        jsonPayload: existing.jsonPayload,
      };

      const nextTitle = typeof patch.title === 'string' ? patch.title.trim() || 'Untitled' : undefined;
      let nextJsonPayload: string | undefined;
      if (typeof patch.fullText === 'string') {
        if (existing.kind !== 'text') {
          setError('Only text creations can be edited.');
          return;
        }
        nextJsonPayload = buildUpdatedTextPayload(existing.jsonPayload, patch.fullText);
      }

      if (!nextTitle && !nextJsonPayload) return;

      setError(null);
      applyDocumentPatch(id, {
        title: nextTitle,
        jsonPayload: nextJsonPayload,
      });

      try {
        if (remoteEnabled) {
          const meta = await updateRemoteGeneratedDocument(id, {
            title: nextTitle,
            jsonPayload: nextJsonPayload,
            expectedRevision: existing.revision ?? 1,
          });
          applyDocumentPatch(id, {
            title: meta.title,
            jsonPayload: meta.jsonPayload,
            revision: meta.revision,
            updatedAt: meta.updatedAt,
          });
        } else {
          const updated = await updateLocalGeneratedDocument(id, {
            title: nextTitle,
            jsonPayload: nextJsonPayload,
          });
          applyDocumentPatch(id, {
            title: updated.title,
            jsonPayload: updated.jsonPayload,
            revision: updated.revision,
            updatedAt: updated.updatedAt ?? Date.now(),
          });
        }
      } catch {
        applyDocumentPatch(id, {
          title: previous.title,
          jsonPayload: previous.jsonPayload,
        });
        setError('Could not update creation.');
      }
    },
    [applyDocumentPatch, documents, remoteEnabled],
  );

  const copyDocumentText = useCallback(
    async (id: string): Promise<boolean> => {
      const item = documents.find((doc) => doc.id === id);
      let record = recordsRef.current.get(id) ?? item?.record ?? null;

      if (remoteEnabled && record && !record.jsonPayload && !record.blob) {
        const hydrated = await hydrateRecord(id);
        if (hydrated) record = hydrated;
      }

      if (!record && !item) return false;

      const copyItem: GeneratedDocumentItem = item
        ? {
            ...item,
            record: record ? { ...item.record, ...record, id: item.id } : item.record,
          }
        : toItem(record!);

      return copyText(getDocumentCopyText(copyItem));
    },
    [documents, hydrateRecord, remoteEnabled],
  );

  const remove = useCallback(
    async (id: string) => {
      setError(null);
      try {
        if (remoteEnabled) {
          await removeRemoteGeneratedDocument(id);
        } else {
          await removeGeneratedDocument(id);
        }
        await refresh();
      } catch {
        setError('Could not remove creation.');
      }
    },
    [refresh, remoteEnabled],
  );

  const getDocument = useCallback(
    (id: string): GeneratedDocumentItem | null => {
      const item = documents.find((doc) => doc.id === id) ?? null;
      if (item && remoteEnabled && !item.record.blob && !item.record.jsonPayload) {
        void hydrateRecord(id).then((record) => {
          if (!record) return;
          setDocuments((current) =>
            current.map((doc) => {
              if (doc.id !== id) return doc;
              const hydratedRecord = {
                ...doc.record,
                ...record,
                id: doc.id,
                kind: doc.kind,
                title: doc.title,
                createdAt: doc.createdAt,
                readAt: doc.readAt,
              };
              recordsRef.current.set(id, hydratedRecord);
              return toItem(hydratedRecord);
            }),
          );
        });
      }
      return item;
    },
    [documents, hydrateRecord, remoteEnabled],
  );

  return {
    documents,
    unreadCount: documents.filter((doc) => !doc.readAt).length,
    count: documents.length,
    isLoading,
    error,
    clearError: () => setError(null),
    saveFromExplanation,
    saveAudio,
    markRead,
    update,
    copyDocumentText,
    remove,
    refresh,
    getDocument,
  };
}
