import {
  GeneratedDocumentError,
  MAX_GENERATED_DOCUMENT_BYTES,
  MAX_GENERATED_DOCUMENTS,
  type GeneratedDocumentRecord,
} from '@/lib/documents/generated-document-types';
import { createUuid } from '@/lib/ids';

const DB_NAME = 'chrysty-generated-docs';
const DB_VERSION = 1;
const STORE_NAME = 'artifacts';

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new GeneratedDocumentError('storage-unavailable', 'Storage is not available.'));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new GeneratedDocumentError('storage-unavailable', 'Could not open generated document storage.'));
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
          reject(new GeneratedDocumentError('storage-unavailable', 'Generated document storage operation failed.'));
        };

        transaction.oncomplete = () => {
          db.close();
          resolve(request.result);
        };

        transaction.onerror = () => {
          db.close();
          reject(new GeneratedDocumentError('storage-unavailable', 'Generated document storage transaction failed.'));
        };
      }),
  );
}

function createDocumentId(): string {
  return createUuid();
}

function validateRecord(record: Omit<GeneratedDocumentRecord, 'id' | 'createdAt'>): void {
  const blobSize = record.blob?.size ?? 0;
  if (blobSize > MAX_GENERATED_DOCUMENT_BYTES) {
    throw new GeneratedDocumentError('too-large', 'File exceeds the 25 MB limit.');
  }
}

export async function listGeneratedDocuments(): Promise<GeneratedDocumentRecord[]> {
  const records = await runTransaction<GeneratedDocumentRecord[]>('readonly', (store) => store.getAll());
  return records.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getGeneratedDocumentById(id: string): Promise<GeneratedDocumentRecord | null> {
  const record = await runTransaction<GeneratedDocumentRecord | undefined>('readonly', (store) =>
    store.get(id),
  );
  return record ?? null;
}

export async function addGeneratedDocument(
  record: Omit<GeneratedDocumentRecord, 'id' | 'createdAt'>,
): Promise<GeneratedDocumentRecord> {
  validateRecord(record);

  const existing = await listGeneratedDocuments();
  if (existing.length >= MAX_GENERATED_DOCUMENTS) {
    throw new GeneratedDocumentError(
      'limit-reached',
      'Maximum 100 saved creations. Remove one to add another.',
    );
  }

  const full: GeneratedDocumentRecord = {
    ...record,
    id: createDocumentId(),
    createdAt: Date.now(),
  };

  await runTransaction('readwrite', (store) => store.put(full));
  return full;
}

export async function addGeneratedDocuments(
  records: Array<Omit<GeneratedDocumentRecord, 'id' | 'createdAt'>>,
): Promise<GeneratedDocumentRecord[]> {
  if (records.length === 0) return [];

  const existing = await listGeneratedDocuments();
  if (existing.length + records.length > MAX_GENERATED_DOCUMENTS) {
    throw new GeneratedDocumentError(
      'limit-reached',
      'Maximum 100 saved creations. Remove some to add more.',
    );
  }

  for (const record of records) {
    validateRecord(record);
  }

  const created: GeneratedDocumentRecord[] = records.map((record) => ({
    ...record,
    id: createDocumentId(),
    createdAt: Date.now(),
  }));

  await openDatabase().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        for (const full of created) {
          store.put(full);
        }

        transaction.oncomplete = () => {
          db.close();
          resolve();
        };

        transaction.onerror = () => {
          db.close();
          reject(new GeneratedDocumentError('storage-unavailable', 'Could not save creations.'));
        };
      }),
  );

  return created;
}

export async function removeGeneratedDocument(id: string): Promise<void> {
  await runTransaction('readwrite', (store) => store.delete(id));
}

export async function updateGeneratedDocument(
  id: string,
  patch: { title?: string; jsonPayload?: string },
): Promise<GeneratedDocumentRecord> {
  return openDatabase().then(
    (db) =>
      new Promise<GeneratedDocumentRecord>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const getRequest = store.get(id);
        let updated: GeneratedDocumentRecord | null = null;

        getRequest.onerror = () => {
          db.close();
          reject(new GeneratedDocumentError('storage-unavailable', 'Could not load saved creation.'));
        };

        getRequest.onsuccess = () => {
          const record = getRequest.result as GeneratedDocumentRecord | undefined;
          if (!record) {
            reject(new GeneratedDocumentError('storage-unavailable', 'Saved creation not found.'));
            return;
          }

          updated = {
            ...record,
            ...(typeof patch.title === 'string' ? { title: patch.title.trim() || 'Untitled' } : {}),
            ...(typeof patch.jsonPayload === 'string' ? { jsonPayload: patch.jsonPayload } : {}),
          };
          store.put(updated);
        };

        transaction.oncomplete = () => {
          db.close();
          if (!updated) {
            reject(new GeneratedDocumentError('storage-unavailable', 'Saved creation not found.'));
            return;
          }
          resolve(updated);
        };

        transaction.onerror = () => {
          db.close();
          reject(new GeneratedDocumentError('storage-unavailable', 'Could not update saved creation.'));
        };
      }),
  );
}

export async function markGeneratedDocumentRead(id: string, readAt = Date.now()): Promise<void> {
  await openDatabase().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const getRequest = store.get(id);

        getRequest.onerror = () => {
          db.close();
          reject(new GeneratedDocumentError('storage-unavailable', 'Could not load saved creation.'));
        };

        getRequest.onsuccess = () => {
          const record = getRequest.result as GeneratedDocumentRecord | undefined;
          if (!record) return;
          store.put({ ...record, readAt });
        };

        transaction.oncomplete = () => {
          db.close();
          resolve();
        };

        transaction.onerror = () => {
          db.close();
          reject(new GeneratedDocumentError('storage-unavailable', 'Could not mark creation as read.'));
        };
      }),
  );
}
