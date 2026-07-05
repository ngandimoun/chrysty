import type { GeneratedDocumentItem } from '@/hooks/use-generated-documents';
import type {
  GeneratedDocumentRecord,
  GeneratedTextPayload,
} from '@/lib/documents/generated-document-types';

function parseTextPayload(jsonPayload: string | undefined): GeneratedTextPayload | null {
  if (!jsonPayload) return null;
  try {
    return JSON.parse(jsonPayload) as GeneratedTextPayload;
  } catch {
    return null;
  }
}

export function getDocumentFullText(record: GeneratedDocumentRecord): string {
  const payload = parseTextPayload(record.jsonPayload);
  return payload?.fullText?.trim() ?? '';
}

export function getDocumentCopyText(item: GeneratedDocumentItem): string {
  if (item.kind === 'text') {
    const fullText = getDocumentFullText(item.record);
    if (fullText) return fullText;
  }
  return item.title;
}

export function buildUpdatedTextPayload(
  existingJson: string | undefined,
  fullText: string,
): string {
  const existing = parseTextPayload(existingJson);
  const payload: GeneratedTextPayload = {
    ...existing,
    fullText,
  };
  return JSON.stringify(payload);
}

export function documentMatchesQuery(item: GeneratedDocumentItem, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  if (item.title.toLowerCase().includes(normalized)) return true;

  const fullText = getDocumentFullText(item.record);
  if (fullText.toLowerCase().includes(normalized)) return true;

  return false;
}
