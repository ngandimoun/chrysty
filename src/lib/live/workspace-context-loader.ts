import {
  GeneratedDocumentConflictError,
  getGeneratedDocument,
  mutateGeneratedDocument,
} from '@/lib/astra/db/documents';
import { buildUpdatedTextPayload, getDocumentFullText } from '@/lib/documents/document-content';
import type { GeneratedDocumentRecord } from '@/lib/documents/generated-document-types';
import { getLiveSession, patchLiveSessionForAstraKey } from '@/lib/live/db';
import {
  MAX_FULL_DOCUMENT_CONTEXT_CHARS,
  compactWorkspaceUiContext,
} from '@/lib/live/workspace-context';

const MAX_DOCUMENT_ACTION_CONTENT_CHARS = 20_000;
const MAX_DOCUMENT_ACTION_TITLE_CHARS = 160;

export class WorkspaceContextError extends Error {
  constructor(
    readonly code:
      | 'session_not_found'
      | 'context_unavailable'
      | 'no_active_document'
      | 'ambiguous_document'
      | 'document_not_found'
      | 'unsupported_document'
      | 'explicit_intent_required'
      | 'revision_conflict'
      | 'invalid_action',
    message: string,
  ) {
    super(message);
    this.name = 'WorkspaceContextError';
  }
}

export function validateActiveDocumentActionScope(input: {
  context: ReturnType<typeof compactWorkspaceUiContext>;
  documentId: string;
  expectedRevision: number;
  currentRevision?: number;
  confirmedUserIntent: boolean;
}) {
  if (!input.confirmedUserIntent) {
    throw new WorkspaceContextError(
      'explicit_intent_required',
      'A direct user request to modify the open document is required.',
    );
  }
  const context = input.context;
  if (!context?.saved || !context.document_id || context.source !== 'generated_document') {
    throw new WorkspaceContextError('no_active_document', 'No generated document is currently open.');
  }
  if (context.document_id !== input.documentId) {
    throw new WorkspaceContextError(
      'ambiguous_document',
      'The requested document does not match the currently open document.',
    );
  }
  if (
    input.currentRevision !== undefined &&
    input.currentRevision !== input.expectedRevision
  ) {
    throw new WorkspaceContextError('revision_conflict', 'The document changed since it was opened.');
  }
}

function recordFromRow(row: NonNullable<Awaited<ReturnType<typeof getGeneratedDocument>>>) {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    createdAt: new Date(row.created_at).getTime(),
    jsonPayload: row.json_payload ?? undefined,
    revision: row.revision,
  } as GeneratedDocumentRecord;
}

async function scopedSession(sessionId: string, astraKey: string) {
  const session = await getLiveSession(sessionId);
  if (!session || session.astra_key !== astraKey) {
    throw new WorkspaceContextError('session_not_found', 'Live session not found.');
  }
  return session;
}

export async function loadActiveWorkspaceContext(input: {
  sessionId: string;
  astraKey: string;
  includeFullDocument?: boolean;
}) {
  const session = await scopedSession(input.sessionId, input.astraKey);
  const context = compactWorkspaceUiContext(session.ui_context);
  if (!context) {
    return { ok: false, code: 'context_unavailable', context: null };
  }

  let document: Record<string, unknown> | null = null;
  if (context.document_id) {
    const row = await getGeneratedDocument(input.astraKey, context.document_id);
    if (!row) {
      return { ok: false, code: 'document_not_found', context, document: null };
    }
    document = {
      id: row.id,
      title: row.title.slice(0, MAX_DOCUMENT_ACTION_TITLE_CHARS),
      kind: row.kind,
      revision: row.revision,
      updated_at: row.updated_at,
    };
    if (input.includeFullDocument === true) {
      document.full_text = getDocumentFullText(recordFromRow(row))
        .slice(0, MAX_FULL_DOCUMENT_CONTEXT_CHARS);
      document.content_truncated =
        getDocumentFullText(recordFromRow(row)).length > MAX_FULL_DOCUMENT_CONTEXT_CHARS;
    }
  }

  return { ok: true, context, document };
}

export async function applyActiveDocumentAction(input: {
  sessionId: string;
  astraKey: string;
  documentId: string;
  expectedRevision: number;
  action: 'update' | 'append' | 'rename';
  confirmedUserIntent: boolean;
  content?: string;
  title?: string;
}) {
  const session = await scopedSession(input.sessionId, input.astraKey);
  const context = compactWorkspaceUiContext(session.ui_context);
  validateActiveDocumentActionScope({
    context,
    documentId: input.documentId,
    expectedRevision: input.expectedRevision,
    confirmedUserIntent: input.confirmedUserIntent,
  });
  if (!context) {
    throw new WorkspaceContextError('no_active_document', 'No generated document is currently open.');
  }

  const current = await getGeneratedDocument(input.astraKey, input.documentId);
  if (!current) {
    throw new WorkspaceContextError('document_not_found', 'Document not found.');
  }
  validateActiveDocumentActionScope({
    context,
    documentId: input.documentId,
    expectedRevision: input.expectedRevision,
    currentRevision: current.revision,
    confirmedUserIntent: input.confirmedUserIntent,
  });

  let title: string | undefined;
  let jsonPayload: string | undefined;
  if (input.action === 'rename') {
    title = input.title?.trim().slice(0, MAX_DOCUMENT_ACTION_TITLE_CHARS);
    if (!title) throw new WorkspaceContextError('invalid_action', 'A new title is required.');
  } else {
    if (current.kind !== 'text') {
      throw new WorkspaceContextError('unsupported_document', 'Only text documents can be updated or appended.');
    }
    const content = input.content?.trim().slice(0, MAX_DOCUMENT_ACTION_CONTENT_CHARS);
    if (!content) throw new WorkspaceContextError('invalid_action', 'Document content is required.');
    const record = recordFromRow(current);
    const previous = getDocumentFullText(record);
    const next = input.action === 'append' && previous ? `${previous}\n\n${content}` : content;
    jsonPayload = buildUpdatedTextPayload(record.jsonPayload, next);
  }

  try {
    const updated = await mutateGeneratedDocument({
      astraKey: input.astraKey,
      documentId: input.documentId,
      expectedRevision: input.expectedRevision,
      action: input.action,
      title,
      jsonPayload,
      userId: current.user_id ?? undefined,
      sessionId: input.sessionId,
      metadata: { source: 'gemini_live', explicit_user_intent: true },
    });
    const nextContext = {
      ...context,
      title: updated.title.slice(0, MAX_DOCUMENT_ACTION_TITLE_CHARS),
      revision: updated.revision,
      selected_passage: '',
      nearby_excerpt: getDocumentFullText(recordFromRow(updated)).slice(0, 1600),
      updated_at: new Date().toISOString(),
    };
    await patchLiveSessionForAstraKey(input.sessionId, input.astraKey, {
      ui_context: nextContext,
    });
    return {
      ok: true,
      action: input.action,
      document: {
        id: updated.id,
        title: updated.title,
        revision: updated.revision,
      },
      ui_context: nextContext,
    };
  } catch (error) {
    if (error instanceof GeneratedDocumentConflictError) {
      throw new WorkspaceContextError('revision_conflict', error.message);
    }
    throw error;
  }
}
