'use client';

import { astraFetch } from '@/lib/astra/api-client';
import { listReferenceDocuments as listLocalReferenceDocuments } from '@/lib/documents/reference-document-store';
import type { ReferenceDocumentRecord } from '@/lib/documents/types';

export interface RemoteReferenceDocumentMeta {
  id: string;
  name: string;
  kind: ReferenceDocumentRecord['kind'];
  mimeType: string;
  size: number;
  createdAt: number;
}

export async function listRemoteReferenceDocuments(): Promise<RemoteReferenceDocumentMeta[]> {
  const response = await astraFetch('/api/astra/reference-documents');
  if (!response.ok) {
    throw new Error('Could not load reference documents');
  }
  const body = (await response.json()) as { documents?: RemoteReferenceDocumentMeta[] };
  return body.documents ?? [];
}

export async function addRemoteReferenceDocument(file: File): Promise<RemoteReferenceDocumentMeta> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await astraFetch('/api/astra/reference-documents', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? 'Could not add document');
  }

  const body = (await response.json()) as { document: RemoteReferenceDocumentMeta };
  return body.document;
}

export async function removeRemoteReferenceDocument(id: string): Promise<void> {
  const response = await astraFetch(`/api/astra/reference-documents?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error('Could not remove document');
  }
}

export async function fetchRemoteReferenceBlob(id: string): Promise<Blob> {
  const response = await astraFetch(`/api/astra/reference-documents/${encodeURIComponent(id)}/download`);
  if (!response.ok) {
    throw new Error('Could not download reference document');
  }
  return response.blob();
}

export async function loadRemoteReferenceDocumentsForRequest(): Promise<ReferenceDocumentRecord[]> {
  const metas = await listRemoteReferenceDocuments();
  const records = await Promise.all(
    metas.map(async (meta) => {
      const blob = await fetchRemoteReferenceBlob(meta.id);
      return {
        id: meta.id,
        name: meta.name,
        kind: meta.kind,
        mimeType: meta.mimeType,
        size: meta.size,
        createdAt: meta.createdAt,
        blob,
      } satisfies ReferenceDocumentRecord;
    }),
  );
  return records;
}

export async function listLocalReferenceDocumentsForMigration(): Promise<ReferenceDocumentRecord[]> {
  try {
    return await listLocalReferenceDocuments();
  } catch {
    return [];
  }
}
