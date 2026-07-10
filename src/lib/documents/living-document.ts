import type { GeneratedDocumentRecord } from './generated-document-types';

const MULTI_DELIVERABLE_PATTERNS = [
  /\b(?:two|three|four|five|\d+)\s+separate\s+(?:documents?|files?|deliverables?|artifacts?)\b/i,
  /\bseparate\s+(?:polished\s+)?(?:markdown\s+)?documents?\b/i,
  /\beach\s+(?:document|file|deliverable|artifact)\s+(?:must|should)\s+be\s+saved\s+separately\b/i,
  /\(1\)[\s\S]{0,240}\(2\)/i,
  /\bchart document\b[\s\S]{0,180}\btext (?:document|executive summary|summary)\b/i,
  /\b(?:save|create|produce)\b[\s\S]{0,120}\b(?:document|file|deliverable|artifact)\b[\s\S]{0,80}\b(?:and|plus)\b[\s\S]{0,80}\b(?:document|file|deliverable|artifact)\b/i,
];

export interface LivingDocumentSource extends Record<string, unknown> {
  system: 'background_objective';
  jobId: string;
  deliverableKey: string;
  objectiveMode: 'living' | 'explicit-multiple';
}

export interface MergeDocumentInput {
  id: string;
  title: string;
  kind: string;
  createdAt: number;
  updatedAt?: number;
  revision: number;
  fullText: string;
}

export interface DocumentMergePreview {
  targetId: string;
  sourceIds: string[];
  title: string;
  expectedRevisions: Record<string, number>;
  markdown: string;
}

export function objectiveRequestsMultipleDeliverables(objective: string): boolean {
  return MULTI_DELIVERABLE_PATTERNS.some((pattern) => pattern.test(objective));
}

export function normalizeDeliverableKey(title: string): string {
  const normalized = title
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return normalized || 'artifact';
}

export function resolveLivingDeliverableKey(input: {
  objective: string;
  title: string;
  kind: string;
}): string {
  if (!objectiveRequestsMultipleDeliverables(input.objective)) return 'primary';
  return `${input.kind}:${normalizeDeliverableKey(input.title)}`;
}

export function livingDocumentSourceKey(jobId: string, deliverableKey: string): string {
  return `background-job:${jobId}:${deliverableKey}`;
}

export function buildLivingDocumentSource(
  jobId: string,
  deliverableKey: string,
  explicitMultiple: boolean,
): LivingDocumentSource {
  return {
    system: 'background_objective',
    jobId,
    deliverableKey,
    objectiveMode: explicitMultiple ? 'explicit-multiple' : 'living',
  };
}

function sectionMarkers(sectionKey: string): { start: string; end: string } {
  const safeKey = normalizeDeliverableKey(sectionKey);
  return {
    start: `<!-- astra-section:${safeKey}:start -->`,
    end: `<!-- astra-section:${safeKey}:end -->`,
  };
}

export function upsertLivingDocumentSection(input: {
  currentMarkdown: string;
  sectionKey: string;
  sectionTitle: string;
  markdown: string;
}): string {
  const current = input.currentMarkdown.trim();
  const content = input.markdown.trim();
  const title = input.sectionTitle.trim() || 'Update';
  const { start, end } = sectionMarkers(input.sectionKey);
  const section = `${start}\n## ${title}\n\n${content}\n${end}`;
  const startIndex = current.indexOf(start);
  const endIndex = startIndex >= 0 ? current.indexOf(end, startIndex + start.length) : -1;

  if (startIndex >= 0 && endIndex >= 0) {
    return `${current.slice(0, startIndex)}${section}${current.slice(endIndex + end.length)}`.trim();
  }
  return current ? `${current}\n\n${section}` : section;
}

export function documentActivity(record: Pick<GeneratedDocumentRecord, 'createdAt' | 'updatedAt'>): number {
  return Math.max(record.createdAt, record.updatedAt ?? record.createdAt);
}

export function buildDocumentMergePreview(documents: MergeDocumentInput[]): DocumentMergePreview {
  if (documents.length < 2) {
    throw new Error('Select at least two documents to merge.');
  }
  if (documents.some((document) => document.kind !== 'text')) {
    throw new Error('Only text documents can be merged.');
  }

  const sorted = [...documents].sort(
    (a, b) =>
      Math.max(b.createdAt, b.updatedAt ?? b.createdAt) -
      Math.max(a.createdAt, a.updatedAt ?? a.createdAt),
  );
  const target = sorted[0]!;
  const sections = sorted.map((document) =>
    upsertLivingDocumentSection({
      currentMarkdown: '',
      sectionKey: `merged-${document.id}`,
      sectionTitle: document.title,
      markdown: document.fullText || '_No text content._',
    }),
  );

  return {
    targetId: target.id,
    sourceIds: sorted.slice(1).map((document) => document.id),
    title: target.title,
    expectedRevisions: Object.fromEntries(sorted.map((document) => [document.id, document.revision])),
    markdown: sections.join('\n\n'),
  };
}

export function requireConfirmedMerge(confirmed: boolean): void {
  if (!confirmed) throw new Error('Merge confirmation is required.');
}
