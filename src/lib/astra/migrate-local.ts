'use client';

import { astraFetch } from '@/lib/astra/api-client';
import { getOrCreateAstraKey } from '@/lib/astra/identity';
import { listLocalGeneratedDocumentsForMigration } from '@/lib/astra/generated-document-remote';
import { listLocalReferenceDocumentsForMigration } from '@/lib/astra/reference-document-remote';
import {
  clearLocalCompanionProfile,
  loadLocalCompanionProfileOnly,
} from '@/lib/astra/profile-remote';
import { isRemotePersistenceEnabled } from '@/lib/astra/api-client';
import { hasCompanionProfile } from '@/lib/client/companion-profile';
import { clearGeneratedDocumentStore } from '@/lib/documents/generated-document-store-local-clear';
import { clearReferenceDocumentStore } from '@/lib/documents/reference-document-store-local-clear';

const MIGRATION_FLAG = 'chrysty_astra_local_migrated';

export function hasCompletedLocalMigration(): boolean {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(MIGRATION_FLAG) === '1';
}

function markLocalMigrationComplete(): void {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(MIGRATION_FLAG, '1');
  }
}

export async function migrateLocalDataIfNeeded(): Promise<void> {
  if (!isRemotePersistenceEnabled() || hasCompletedLocalMigration()) {
    return;
  }

  getOrCreateAstraKey();

  const profile = loadLocalCompanionProfileOnly();
  const referenceDocs = await listLocalReferenceDocumentsForMigration();
  const generatedDocs = await listLocalGeneratedDocumentsForMigration();

  const hasProfile = hasCompanionProfile(profile);
  const hasData = hasProfile || referenceDocs.length > 0 || generatedDocs.length > 0;
  if (!hasData) {
    markLocalMigrationComplete();
    return;
  }

  const formData = new FormData();
  if (hasProfile) {
    formData.append('profile', JSON.stringify(profile));
  }

  if (referenceDocs.length > 0) {
    formData.append(
      'referenceMeta',
      JSON.stringify(
        referenceDocs.map((doc) => ({
          id: doc.id,
          name: doc.name,
          mimeType: doc.mimeType,
        })),
      ),
    );
    for (const doc of referenceDocs) {
      formData.append(
        `reference:${doc.id}`,
        new File([doc.blob], doc.name, { type: doc.mimeType }),
      );
    }
  }

  if (generatedDocs.length > 0) {
    formData.append(
      'generatedMeta',
      JSON.stringify(
        generatedDocs.map((doc) => ({
          id: doc.id,
          kind: doc.kind,
          title: doc.title,
          mimeType: doc.mimeType,
          jsonPayload: doc.jsonPayload,
        })),
      ),
    );
    for (const doc of generatedDocs) {
      if (doc.blob) {
        formData.append(
          `generated:${doc.id}`,
          new File([doc.blob], doc.title, { type: doc.mimeType ?? 'application/octet-stream' }),
        );
      }
    }
  }

  const response = await astraFetch('/api/astra/migrate-local', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    return;
  }

  const body = (await response.json()) as { migrated?: boolean; reason?: string };
  if (body.migrated || body.reason === 'remote-data-exists') {
    clearLocalCompanionProfile();
    await clearReferenceDocumentStore();
    await clearGeneratedDocumentStore();
    markLocalMigrationComplete();
  }
}
