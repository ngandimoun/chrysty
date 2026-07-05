export const MAX_REFERENCE_DOCUMENTS = 5;
export const MAX_REFERENCE_DOCUMENT_BYTES = 10 * 1024 * 1024;

export const REFERENCE_DOCUMENT_ACCEPT_UPLOAD =
  'image/jpeg,image/png,image/webp,application/pdf';
export const REFERENCE_DOCUMENT_ACCEPT_SCAN = 'image/*';

export type ReferenceDocumentKind = 'image' | 'pdf';

export interface ReferenceDocumentRecord {
  id: string;
  name: string;
  kind: ReferenceDocumentKind;
  mimeType: string;
  size: number;
  createdAt: number;
  blob: Blob;
}

export interface ReferenceDocumentMeta {
  id: string;
  name: string;
  kind: ReferenceDocumentKind;
  mimeType: string;
}

export class ReferenceDocumentError extends Error {
  readonly code: 'limit-reached' | 'too-large' | 'unsupported-type' | 'storage-unavailable';

  constructor(
    code: ReferenceDocumentError['code'],
    message: string,
  ) {
    super(message);
    this.name = 'ReferenceDocumentError';
    this.code = code;
  }
}

export function normalizeReferenceMimeType(mimeType: string): string {
  const raw = mimeType.trim().toLowerCase();
  if (!raw) return '';
  return raw.split(';')[0]?.trim() ?? raw;
}

export function referenceDocumentKindFromMime(mimeType: string): ReferenceDocumentKind | null {
  const normalized = normalizeReferenceMimeType(mimeType);
  if (normalized === 'application/pdf') return 'pdf';
  if (normalized === 'image/jpeg' || normalized === 'image/png' || normalized === 'image/webp') {
    return 'image';
  }
  return null;
}

export function isAcceptedReferenceMimeType(mimeType: string): boolean {
  return referenceDocumentKindFromMime(mimeType) !== null;
}
