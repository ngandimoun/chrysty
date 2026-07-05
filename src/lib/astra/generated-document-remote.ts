'use client';

import { astraFetch } from '@/lib/astra/api-client';
import { listGeneratedDocuments as listLocalGeneratedDocuments } from '@/lib/documents/generated-document-store';
import type { GeneratedDocumentKind, GeneratedDocumentRecord } from '@/lib/documents/generated-document-types';

export interface RemoteGeneratedDocumentMeta {
  id: string;
  kind: GeneratedDocumentKind;
  title: string;
  createdAt: number;
  readAt?: number | null;
  mimeType?: string;
  jsonPayload?: string;
  hasBlob: boolean;
  jobId?: string;
}

export async function listRemoteGeneratedDocuments(): Promise<RemoteGeneratedDocumentMeta[]> {
  const response = await astraFetch('/api/astra/generated-documents');
  if (!response.ok) {
    throw new Error('Could not load generated documents');
  }
  const body = (await response.json()) as { documents?: RemoteGeneratedDocumentMeta[] };
  return body.documents ?? [];
}

export async function addRemoteGeneratedDocument(
  record: Omit<GeneratedDocumentRecord, 'id' | 'createdAt'> & { id?: string },
): Promise<RemoteGeneratedDocumentMeta> {
  const formData = new FormData();
  formData.append('kind', record.kind);
  formData.append('title', record.title);
  if (record.mimeType) formData.append('mimeType', record.mimeType);
  if (record.jsonPayload) formData.append('jsonPayload', record.jsonPayload);
  if (record.id) formData.append('id', record.id);
  if (record.blob) {
    formData.append('file', record.blob, record.title);
  }

  const response = await astraFetch('/api/astra/generated-documents', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? 'Could not save creation');
  }

  const body = (await response.json()) as { document: RemoteGeneratedDocumentMeta };
  return body.document;
}

export async function removeRemoteGeneratedDocument(id: string): Promise<void> {
  const response = await astraFetch(`/api/astra/generated-documents?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error('Could not remove creation');
  }
}

export async function updateRemoteGeneratedDocument(
  id: string,
  patch: { title?: string; jsonPayload?: string },
): Promise<RemoteGeneratedDocumentMeta> {
  const response = await astraFetch('/api/astra/generated-documents', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, ...patch }),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? 'Could not update creation');
  }

  const body = (await response.json()) as { document: RemoteGeneratedDocumentMeta };
  return body.document;
}

export async function markRemoteGeneratedDocumentRead(
  id: string,
  readAt = Date.now(),
): Promise<RemoteGeneratedDocumentMeta> {
  const response = await astraFetch('/api/astra/generated-documents', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, readAt }),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? 'Could not mark creation as read');
  }

  const body = (await response.json()) as { document: RemoteGeneratedDocumentMeta };
  return body.document;
}

export async function fetchRemoteGeneratedRecord(id: string): Promise<GeneratedDocumentRecord> {
  const response = await astraFetch(`/api/astra/generated-documents/${encodeURIComponent(id)}/download`);
  if (!response.ok) {
    throw new Error('Could not download creation');
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const body = (await response.json()) as {
      mimeType?: string;
      jsonPayload?: string;
    };
    return {
      id,
      kind: 'text',
      title: 'Untitled',
      createdAt: Date.now(),
      mimeType: body.mimeType,
      jsonPayload: body.jsonPayload,
    };
  }

  const blob = await response.blob();
  return {
    id,
    kind: 'other',
    title: 'Untitled',
    createdAt: Date.now(),
    mimeType: blob.type || undefined,
    blob,
  };
}

export async function listLocalGeneratedDocumentsForMigration(): Promise<GeneratedDocumentRecord[]> {
  try {
    return await listLocalGeneratedDocuments();
  } catch {
    return [];
  }
}
