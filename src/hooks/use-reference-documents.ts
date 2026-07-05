'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { isRemotePersistenceEnabled } from '@/lib/astra/api-client';
import {
  addRemoteReferenceDocument,
  fetchRemoteReferenceBlob,
  listRemoteReferenceDocuments,
  removeRemoteReferenceDocument,
  type RemoteReferenceDocumentMeta,
} from '@/lib/astra/reference-document-remote';
import {
  addReferenceDocument,
  listReferenceDocuments,
  removeReferenceDocument,
} from '@/lib/documents/reference-document-store';
import {
  MAX_REFERENCE_DOCUMENTS,
  ReferenceDocumentError,
  type ReferenceDocumentRecord,
} from '@/lib/documents/types';

export interface ReferenceDocumentItem {
  id: string;
  name: string;
  kind: ReferenceDocumentRecord['kind'];
  mimeType: string;
  size: number;
  createdAt: number;
  previewUrl: string | null;
}

interface UseReferenceDocumentsResult {
  documents: ReferenceDocumentItem[];
  count: number;
  isAtLimit: boolean;
  isLoading: boolean;
  error: string | null;
  clearError: () => void;
  addFromFile: (file: File) => Promise<void>;
  remove: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

function toItemFromRecord(record: ReferenceDocumentRecord): ReferenceDocumentItem {
  return {
    id: record.id,
    name: record.name,
    kind: record.kind,
    mimeType: record.mimeType,
    size: record.size,
    createdAt: record.createdAt,
    previewUrl: record.kind === 'image' ? URL.createObjectURL(record.blob) : null,
  };
}

function toItemFromRemote(meta: RemoteReferenceDocumentMeta, previewUrl: string | null): ReferenceDocumentItem {
  return {
    id: meta.id,
    name: meta.name,
    kind: meta.kind,
    mimeType: meta.mimeType,
    size: meta.size,
    createdAt: meta.createdAt,
    previewUrl,
  };
}

export function useReferenceDocuments(): UseReferenceDocumentsResult {
  const remoteEnabled = isRemotePersistenceEnabled();
  const [documents, setDocuments] = useState<ReferenceDocumentItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewUrlsRef = useRef<string[]>([]);

  const revokePreviewUrls = useCallback(() => {
    previewUrlsRef.current.forEach((url) => {
      if (url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    });
    previewUrlsRef.current = [];
  }, []);

  const applyItems = useCallback(
    (items: ReferenceDocumentItem[]) => {
      revokePreviewUrls();
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
        const metas = await listRemoteReferenceDocuments();
        const items = await Promise.all(
          metas.map(async (meta) => {
            if (meta.kind !== 'image') {
              return toItemFromRemote(meta, null);
            }
            try {
              const blob = await fetchRemoteReferenceBlob(meta.id);
              return toItemFromRemote(meta, URL.createObjectURL(blob));
            } catch {
              return toItemFromRemote(meta, null);
            }
          }),
        );
        applyItems(items);
      } else {
        const records = await listReferenceDocuments();
        applyItems(records.map(toItemFromRecord));
      }
    } catch {
      setDocuments([]);
      setError('Could not load saved documents.');
    } finally {
      setIsLoading(false);
    }
  }, [applyItems, remoteEnabled]);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) void refresh();
    });
    return () => {
      cancelled = true;
      revokePreviewUrls();
    };
  }, [refresh, revokePreviewUrls]);

  const addFromFile = useCallback(
    async (file: File) => {
      setError(null);
      try {
        if (remoteEnabled) {
          await addRemoteReferenceDocument(file);
        } else {
          await addReferenceDocument(file, file.name, file.type);
        }
        await refresh();
      } catch (err) {
        setError(err instanceof ReferenceDocumentError || err instanceof Error ? err.message : 'Could not add document.');
        throw err;
      }
    },
    [refresh, remoteEnabled],
  );

  const remove = useCallback(
    async (id: string) => {
      setError(null);
      try {
        if (remoteEnabled) {
          await removeRemoteReferenceDocument(id);
        } else {
          await removeReferenceDocument(id);
        }
        await refresh();
      } catch {
        setError('Could not remove document.');
      }
    },
    [refresh, remoteEnabled],
  );

  return {
    documents,
    count: documents.length,
    isAtLimit: documents.length >= MAX_REFERENCE_DOCUMENTS,
    isLoading,
    error,
    clearError: () => setError(null),
    addFromFile,
    remove,
    refresh,
  };
}
