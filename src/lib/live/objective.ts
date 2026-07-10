import type { DraftObjective, ObjectiveEnvelope, ObjectiveEvidence } from '@/lib/live/types';
import { normalizeBcp47 } from '@/lib/language/language-resolution';

const MAX_OBJECTIVE_CHARS = 4000;
const MAX_LIST_ITEMS = 12;
const MAX_ITEM_CHARS = 500;
const MAX_EXCERPT_CHARS = 1200;

function text(value: unknown, limit: number): string {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, MAX_LIST_ITEMS)
    .map((item) => text(item, MAX_ITEM_CHARS))
    .filter(Boolean);
}

function evidenceList(value: unknown): ObjectiveEvidence[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_LIST_ITEMS).flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const id = text(record.id, 120);
    const excerpt = text(record.excerpt, MAX_EXCERPT_CHARS);
    if (!id && !excerpt) return [];
    return [{ id, kind: text(record.kind, 40) || 'context', excerpt }];
  });
}

function documentAction(value: unknown): DraftObjective['document_action'] {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const action =
    source.action === 'update' || source.action === 'append' || source.action === 'rename'
      ? source.action
      : null;
  const documentId = text(source.document_id, 128);
  const revision =
    typeof source.expected_revision === 'number' && Number.isSafeInteger(source.expected_revision)
      ? source.expected_revision
      : 0;
  if (!action || !documentId || revision < 1 || source.explicit_user_intent !== true) return null;
  return {
    action,
    document_id: documentId,
    expected_revision: revision,
    explicit_user_intent: true,
  };
}

export function compactDraftObjective(value: unknown): DraftObjective | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const readiness =
    source.readiness === 'ready' ||
    source.readiness === 'needs_clarification' ||
    source.readiness === 'suggest_enrichment'
      ? source.readiness
      : 'needs_clarification';
  const objective = text(source.objective, MAX_OBJECTIVE_CHARS);
  if (!objective) return null;
  return {
    objective,
    constraints: stringList(source.constraints),
    evidence: evidenceList(source.evidence),
    artifact_language: text(source.artifact_language, 80),
    deliverable: text(source.deliverable, 300),
    open_question: text(source.open_question, 300) || null,
    success_criteria: stringList(source.success_criteria),
    requested_intents: stringList(source.requested_intents),
    document_action: documentAction(source.document_action),
    readiness,
  };
}

export function compactObjectiveEnvelope(value: unknown): ObjectiveEnvelope | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const source = value as Record<string, unknown>;
  const finalizedObjective = text(source.finalized_objective, MAX_OBJECTIVE_CHARS);
  if (!finalizedObjective) return undefined;
  const language =
    source.language && typeof source.language === 'object'
      ? (source.language as Record<string, unknown>)
      : {};
  return {
    version: 1,
    finalized_objective: finalizedObjective,
    evidence: evidenceList(source.evidence),
    constraints: stringList(source.constraints),
    language: {
      resolved: normalizeBcp47(text(language.resolved, 80)),
      requested: text(language.requested, 80) || 'match the user request',
    },
    deliverable: text(source.deliverable, 300) || 'a useful response',
    success_criteria: stringList(source.success_criteria),
    requested_intents: stringList(source.requested_intents),
    document_action: documentAction(source.document_action),
  };
}

export function formatObjectiveEnvelope(envelope: ObjectiveEnvelope): string {
  return [
    'Authoritative objective envelope (follow this over ambiguous legacy transcript wording):',
    JSON.stringify(envelope),
    'Requested intents describe desired outcomes only. Do not claim document mutation, scheduling, or timer execution unless an available tool actually performs it.',
  ].join('\n');
}
