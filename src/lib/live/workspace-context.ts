export const MAX_WORKSPACE_CONTEXT_TITLE_CHARS = 160;
export const MAX_WORKSPACE_SELECTION_CHARS = 800;
export const MAX_WORKSPACE_EXCERPT_CHARS = 1600;
export const MAX_WORKSPACE_DOCUMENT_ID_CHARS = 128;
export const MAX_FULL_DOCUMENT_CONTEXT_CHARS = 20_000;

export type WorkspaceContextSource = 'generated_document' | 'explanation_canvas';

export interface WorkspaceUiContext {
  source: WorkspaceContextSource;
  document_id: string | null;
  title: string;
  revision: number | null;
  selected_passage: string;
  nearby_excerpt: string;
  saved: boolean;
  updated_at: string;
  artifact_language?: string;
}

function boundedText(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

export function buildNearbyExcerpt(
  fullText: string,
  selectedPassage: string,
  maxChars = MAX_WORKSPACE_EXCERPT_CHARS,
): string {
  const normalizedText = fullText.replace(/\s+/g, ' ').trim();
  const selection = selectedPassage.replace(/\s+/g, ' ').trim();
  if (!normalizedText) return '';
  if (!selection) return normalizedText.slice(0, maxChars);

  const index = normalizedText.indexOf(selection);
  if (index < 0) return normalizedText.slice(0, maxChars);
  const spare = Math.max(0, maxChars - Math.min(selection.length, maxChars));
  const start = Math.max(0, index - Math.floor(spare / 2));
  return normalizedText.slice(start, start + maxChars);
}

export function compactWorkspaceUiContext(value: unknown): WorkspaceUiContext | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  const source =
    input.source === 'generated_document' || input.source === 'explanation_canvas'
      ? input.source
      : null;
  if (!source) return null;

  const documentId = boundedText(input.document_id, MAX_WORKSPACE_DOCUMENT_ID_CHARS) || null;
  const saved = input.saved === true;
  if (saved && !documentId) return null;

  const rawRevision =
    typeof input.revision === 'number' && Number.isSafeInteger(input.revision)
      ? input.revision
      : null;

  return {
    source,
    document_id: documentId,
    title: boundedText(input.title, MAX_WORKSPACE_CONTEXT_TITLE_CHARS),
    revision: rawRevision !== null && rawRevision > 0 ? rawRevision : null,
    selected_passage: boundedText(input.selected_passage, MAX_WORKSPACE_SELECTION_CHARS),
    nearby_excerpt: boundedText(input.nearby_excerpt, MAX_WORKSPACE_EXCERPT_CHARS),
    saved,
    updated_at:
      boundedText(input.updated_at, 40) || new Date().toISOString(),
    ...(boundedText(input.artifact_language, 40)
      ? { artifact_language: boundedText(input.artifact_language, 40) }
      : {}),
  };
}

export function createWorkspaceUiContext(input: {
  source: WorkspaceContextSource;
  documentId?: string | null;
  title?: string;
  revision?: number | null;
  selectedPassage?: string;
  fullText?: string;
  saved: boolean;
  artifactLanguage?: string;
}): WorkspaceUiContext {
  return compactWorkspaceUiContext({
    source: input.source,
    document_id: input.documentId ?? null,
    title: input.title ?? '',
    revision: input.revision ?? null,
    selected_passage: input.selectedPassage ?? '',
    nearby_excerpt: buildNearbyExcerpt(input.fullText ?? '', input.selectedPassage ?? ''),
    saved: input.saved,
    artifact_language: input.artifactLanguage,
    updated_at: new Date().toISOString(),
  })!;
}
