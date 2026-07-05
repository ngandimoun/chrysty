import type { GoogleGenAI } from '@google/genai';

import {
  isAcceptedReferenceMimeType,
  MAX_REFERENCE_DOCUMENT_BYTES,
  MAX_REFERENCE_DOCUMENTS,
  normalizeReferenceMimeType,
  referenceDocumentKindFromMime,
  type ReferenceDocumentKind,
  type ReferenceDocumentMeta,
} from '@/lib/documents/types';

export interface ParsedReferenceDocument {
  id: string;
  name: string;
  kind: ReferenceDocumentKind;
  mimeType: string;
  bytes: Buffer;
}

function parseReferenceDocsMeta(raw: string | null): ReferenceDocumentMeta[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item) => {
        const record = item as Record<string, unknown>;
        const kind = record.kind === 'pdf' ? 'pdf' : record.kind === 'image' ? 'image' : null;
        const mimeType = normalizeReferenceMimeType(String(record.mimeType ?? ''));
        if (!kind || !isAcceptedReferenceMimeType(mimeType)) return null;

        return {
          id: String(record.id ?? ''),
          name: String(record.name ?? 'document'),
          kind,
          mimeType,
        } satisfies ReferenceDocumentMeta;
      })
      .filter((item): item is ReferenceDocumentMeta => Boolean(item?.id));
  } catch {
    return [];
  }
}

export async function parseReferenceDocumentInputs(
  formData: FormData,
): Promise<ParsedReferenceDocument[]> {
  const files = formData
    .getAll('referenceDocs')
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (files.length === 0) {
    return [];
  }

  if (files.length > MAX_REFERENCE_DOCUMENTS) {
    throw new Error(`Too many reference documents. Maximum is ${MAX_REFERENCE_DOCUMENTS}.`);
  }

  const meta = parseReferenceDocsMeta(String(formData.get('referenceDocsMeta') ?? ''));
  if (meta.length > 0 && meta.length !== files.length) {
    throw new Error('Reference document metadata count does not match uploaded files.');
  }

  const documents: ParsedReferenceDocument[] = [];

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index]!;
    if (file.size > MAX_REFERENCE_DOCUMENT_BYTES) {
      throw new Error('Reference document exceeds the 10 MB limit.');
    }

    const itemMeta = meta[index];
    const mimeType = normalizeReferenceMimeType(itemMeta?.mimeType || file.type);
    const kind = referenceDocumentKindFromMime(mimeType);

    if (!kind || !isAcceptedReferenceMimeType(mimeType)) {
      throw new Error(`Unsupported reference document type: ${mimeType || 'unknown'}.`);
    }

    documents.push({
      id: itemMeta?.id || `reference-${index}`,
      name: itemMeta?.name || file.name || 'document',
      kind,
      mimeType,
      bytes: Buffer.from(await file.arrayBuffer()),
    });
  }

  return documents;
}

export function buildReferenceDocumentsBlock(
  documents: Array<Pick<ParsedReferenceDocument, 'name' | 'kind'>>,
): string {
  if (documents.length === 0) {
    return '';
  }

  const lines = documents.map((doc) => `- ${doc.name} (${doc.kind})`);

  return [
    'User reference documents (saved on device — use when relevant to the question; do not recite all unless asked):',
    ...lines,
    'Treat these as authoritative context for questions about the user\'s paperwork, policies, receipts, forms, and saved files.',
    'Reference document images and PDFs are attached to this turn — read them when the user asks about their documents.',
  ].join('\n');
}

export async function uploadReferencePdfForGemini(
  client: GoogleGenAI,
  bytes: Buffer,
): Promise<{ uri: string; mimeType: string }> {
  const uploadedFile = await client.files.upload({
    file: new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
    config: { mimeType: 'application/pdf' },
  });

  if (!uploadedFile.uri) {
    throw new Error('Gemini file upload did not return a URI.');
  }

  return {
    uri: uploadedFile.uri,
    mimeType: 'application/pdf',
  };
}
