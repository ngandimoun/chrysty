import { getUploadsBucket } from '@/lib/supabase/admin';

export function referenceStoragePath(workspaceId: string, documentId: string): string {
  return `${workspaceId}/ref/${documentId}`;
}

export function generatedStoragePath(workspaceId: string, documentId: string): string {
  return `${workspaceId}/gen/${documentId}`;
}

export function getStorageBucket(): string {
  return getUploadsBucket();
}
