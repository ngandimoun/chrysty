import {
  isAcceptedReferenceMimeType,
  MAX_REFERENCE_DOCUMENT_BYTES,
  MAX_REFERENCE_DOCUMENTS,
  normalizeReferenceMimeType,
  referenceDocumentKindFromMime,
  ReferenceDocumentError,
  type ReferenceDocumentRecord,
} from '@/lib/documents/types';
import { createUuid } from '@/lib/ids';

const DB_NAME = 'chrysty-reference-docs';
const DB_VERSION = 1;
const STORE_NAME = 'documents';

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new ReferenceDocumentError('storage-unavailable', 'Storage is not available.'));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new ReferenceDocumentError('storage-unavailable', 'Could not open document storage.'));
    };

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
  });
}

function runTransaction<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, mode);
        const store = transaction.objectStore(STORE_NAME);
        const request = run(store);

        request.onerror = () => {
          db.close();
          reject(new ReferenceDocumentError('storage-unavailable', 'Document storage operation failed.'));
        };

        transaction.oncomplete = () => {
          db.close();
          resolve(request.result);
        };

        transaction.onerror = () => {
          db.close();
          reject(new ReferenceDocumentError('storage-unavailable', 'Document storage transaction failed.'));
        };
      }),
  );
}

function createDocumentId(): string {
  return createUuid();
}

export async function listReferenceDocuments(): Promise<ReferenceDocumentRecord[]> {
  const records = await runTransaction<ReferenceDocumentRecord[]>('readonly', (store) => store.getAll());
  return records.sort((a, b) => a.createdAt - b.createdAt);
}

export async function addReferenceDocument(
  blob: Blob,
  name: string,
  mimeType: string,
): Promise<ReferenceDocumentRecord> {
  const normalizedMime = normalizeReferenceMimeType(mimeType);
  const kind = referenceDocumentKindFromMime(normalizedMime);

  if (!kind || !isAcceptedReferenceMimeType(normalizedMime)) {
    throw new ReferenceDocumentError(
      'unsupported-type',
      'Unsupported file type. Use JPEG, PNG, WebP, or PDF.',
    );
  }

  if (blob.size > MAX_REFERENCE_DOCUMENT_BYTES) {
    throw new ReferenceDocumentError('too-large', 'File exceeds the 10 MB limit.');
  }

  const existing = await listReferenceDocuments();
  if (existing.length >= MAX_REFERENCE_DOCUMENTS) {
    throw new ReferenceDocumentError(
      'limit-reached',
      'Maximum 5 documents. Remove one to add another.',
    );
  }

  const record: ReferenceDocumentRecord = {
    id: createDocumentId(),
    name: name.trim() || 'document',
    kind,
    mimeType: normalizedMime,
    size: blob.size,
    createdAt: Date.now(),
    blob,
  };

  await runTransaction('readwrite', (store) => store.put(record));
  return record;
}

export async function removeReferenceDocument(id: string): Promise<void> {
  await runTransaction('readwrite', (store) => store.delete(id));
}
