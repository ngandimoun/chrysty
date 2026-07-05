'use client';

const DB_NAME = 'chrysty-reference-docs';
const STORE_NAME = 'documents';

export async function clearReferenceDocumentStore(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;

  await new Promise<void>((resolve) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.close();
        resolve();
        return;
      }
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).clear();
      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () => {
        db.close();
        resolve();
      };
    };
    request.onerror = () => resolve();
  });
}
