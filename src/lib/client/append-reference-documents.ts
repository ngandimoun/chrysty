import { isRemotePersistenceEnabled } from '@/lib/astra/api-client';
import { loadRemoteReferenceDocumentsForRequest } from '@/lib/astra/reference-document-remote';
import { loadCompanionProfileForApp } from '@/lib/astra/profile-remote';
import { listReferenceDocuments } from '@/lib/documents/reference-document-store';
import type { ReferenceDocumentRecord } from '@/lib/documents/types';

export async function loadReferenceDocumentsForRequest(): Promise<ReferenceDocumentRecord[]> {
  try {
    if (isRemotePersistenceEnabled()) {
      return await loadRemoteReferenceDocumentsForRequest();
    }
    return await listReferenceDocuments();
  } catch {
    return [];
  }
}

export function appendReferenceDocumentsToFormData(
  formData: FormData,
  documents: ReferenceDocumentRecord[],
): void {
  if (documents.length === 0) {
    return;
  }

  documents.forEach((doc, index) => {
    formData.append(
      'referenceDocs',
      new File([doc.blob], doc.name || `reference-${index + 1}`, { type: doc.mimeType }),
    );
  });

  formData.append(
    'referenceDocsMeta',
    JSON.stringify(
      documents.map((doc) => ({
        id: doc.id,
        name: doc.name,
        kind: doc.kind,
        mimeType: doc.mimeType,
      })),
    ),
  );
}

export { loadCompanionProfileForApp as loadCompanionProfileForRequest };
