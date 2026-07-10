import {
  MAX_REFERENCE_DOCUMENT_BYTES,
  MAX_REFERENCE_DOCUMENTS,
  normalizeReferenceMimeType,
  referenceDocumentKindFromMime,
  type ReferenceDocumentKind,
} from '@/lib/documents/types';
import { generatedStoragePath, getStorageBucket, referenceStoragePath } from '@/lib/astra/storage-paths';
import { createUuid } from '@/lib/ids';
import { createUntypedAdminClient } from '@/lib/supabase/admin';
import type {
  AstraGeneratedDocumentRow,
  AstraReferenceDocumentRow,
} from '@/lib/supabase/astra-schema.types';
import { normalizeBcp47 } from '@/lib/language/language-resolution';

function createDocumentId(): string {
  return createUuid();
}

export async function listReferenceDocuments(astraKey: string): Promise<AstraReferenceDocumentRow[]> {
  const { data, error } = await createUntypedAdminClient()
    .from('astra_reference_documents')
    .select('*')
    .eq('astra_key', astraKey)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as AstraReferenceDocumentRow[];
}

export async function addReferenceDocument(params: {
  workspaceId: string;
  astraKey: string;
  userId?: string;
  name: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<AstraReferenceDocumentRow> {
  const mimeType = normalizeReferenceMimeType(params.mimeType);
  const kind = referenceDocumentKindFromMime(mimeType) as ReferenceDocumentKind | null;
  if (!kind) {
    throw new Error('Unsupported file type. Use JPEG, PNG, WebP, or PDF.');
  }

  if (params.buffer.byteLength > MAX_REFERENCE_DOCUMENT_BYTES) {
    throw new Error('File exceeds the 10 MB limit.');
  }

  const existing = await listReferenceDocuments(params.astraKey);
  if (existing.length >= MAX_REFERENCE_DOCUMENTS) {
    throw new Error('Maximum 5 documents. Remove one to add another.');
  }

  const id = createDocumentId();
  const storagePath = referenceStoragePath(params.workspaceId, id);
  const bucket = getStorageBucket();

  const { error: uploadError } = await createUntypedAdminClient()
    .storage.from(bucket)
    .upload(storagePath, params.buffer, { contentType: mimeType, upsert: false });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const row = {
    id,
    workspace_id: params.workspaceId,
    astra_key: params.astraKey,
    user_id: params.userId ?? null,
    name: params.name.trim() || 'document',
    kind,
    mime_type: mimeType,
    size_bytes: params.buffer.byteLength,
    storage_path: storagePath,
  };

  const { data, error } = await createUntypedAdminClient()
    .from('astra_reference_documents')
    .insert(row)
    .select('*')
    .single();

  if (error) {
    await createUntypedAdminClient().storage.from(bucket).remove([storagePath]);
    throw new Error(error.message);
  }

  return data as AstraReferenceDocumentRow;
}

export async function removeReferenceDocument(astraKey: string, id: string): Promise<void> {
  const supabase = createUntypedAdminClient();
  const { data, error } = await supabase
    .from('astra_reference_documents')
    .select('storage_path')
    .eq('astra_key', astraKey)
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return;

  const bucket = getStorageBucket();
  await supabase.storage.from(bucket).remove([data.storage_path]);

  const { error: deleteError } = await supabase
    .from('astra_reference_documents')
    .delete()
    .eq('astra_key', astraKey)
    .eq('id', id);

  if (deleteError) throw new Error(deleteError.message);
}

export async function downloadReferenceDocument(
  astraKey: string,
  id: string,
): Promise<{ buffer: Buffer; mimeType: string; name: string }> {
  const { data, error } = await createUntypedAdminClient()
    .from('astra_reference_documents')
    .select('storage_path, mime_type, name')
    .eq('astra_key', astraKey)
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('Document not found');

  const bucket = getStorageBucket();
  const { data: blob, error: downloadError } = await createUntypedAdminClient()
    .storage.from(bucket)
    .download(data.storage_path);

  if (downloadError || !blob) {
    throw new Error(downloadError?.message ?? 'Could not download document');
  }

  const arrayBuffer = await blob.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    mimeType: data.mime_type,
    name: data.name,
  };
}

export async function listGeneratedDocuments(astraKey: string): Promise<AstraGeneratedDocumentRow[]> {
  const { data, error } = await createUntypedAdminClient()
    .from('astra_generated_documents')
    .select('*')
    .eq('astra_key', astraKey)
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as AstraGeneratedDocumentRow[];
}

export async function getGeneratedDocumentBySourceKey(
  astraKey: string,
  sourceKey: string,
): Promise<AstraGeneratedDocumentRow | null> {
  const { data, error } = await createUntypedAdminClient()
    .from('astra_generated_documents')
    .select('*')
    .eq('astra_key', astraKey)
    .eq('source_key', sourceKey)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as AstraGeneratedDocumentRow | null) ?? null;
}

export async function getGeneratedDocument(
  astraKey: string,
  id: string,
): Promise<AstraGeneratedDocumentRow | null> {
  const { data, error } = await createUntypedAdminClient()
    .from('astra_generated_documents')
    .select('*')
    .eq('astra_key', astraKey)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as AstraGeneratedDocumentRow | null) ?? null;
}

export class GeneratedDocumentConflictError extends Error {
  constructor(message = 'The document changed since it was opened.') {
    super(message);
    this.name = 'GeneratedDocumentConflictError';
  }
}

export async function mutateGeneratedDocument(params: {
  astraKey: string;
  documentId: string;
  expectedRevision: number;
  action: 'update' | 'append' | 'rename';
  title?: string;
  jsonPayload?: string;
  userId?: string;
  sessionId: string;
  metadata?: Record<string, unknown>;
}): Promise<AstraGeneratedDocumentRow> {
  const { data, error } = await createUntypedAdminClient().rpc(
    'mutate_astra_generated_document',
    {
      p_astra_key: params.astraKey,
      p_document_id: params.documentId,
      p_expected_revision: params.expectedRevision,
      p_action: params.action,
      p_title: params.title ?? null,
      p_json_payload: params.jsonPayload ?? null,
      p_user_id: params.userId ?? null,
      p_session_id: params.sessionId,
      p_metadata: params.metadata ?? {},
    },
  );

  if (error) {
    if (error.message.includes('revision_conflict')) {
      throw new GeneratedDocumentConflictError();
    }
    throw new Error(error.message);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Document not found');
  return row as AstraGeneratedDocumentRow;
}

export async function addGeneratedDocument(params: {
  workspaceId: string;
  astraKey: string;
  userId?: string;
  id?: string;
  kind: string;
  title: string;
  mimeType?: string;
  jsonPayload?: string;
  buffer?: Buffer;
  jobId?: string;
  sourceKey?: string;
  sourceMetadata?: Record<string, unknown>;
  auditMetadata?: Record<string, unknown>;
  artifactLanguage?: string;
}): Promise<AstraGeneratedDocumentRow> {
  const { MAX_GENERATED_DOCUMENT_BYTES, MAX_GENERATED_DOCUMENTS } = await import(
    '@/lib/documents/generated-document-types'
  );

  const existing = await listGeneratedDocuments(params.astraKey);
  if (existing.length >= MAX_GENERATED_DOCUMENTS) {
    throw new Error('Maximum 100 saved creations. Remove one to add another.');
  }

  const buffer = params.buffer ?? Buffer.alloc(0);
  if (buffer.byteLength > MAX_GENERATED_DOCUMENT_BYTES) {
    throw new Error('File exceeds the 25 MB limit.');
  }

  const id = params.id ?? createDocumentId();
  let storagePath: string | null = null;

  if (buffer.byteLength > 0) {
    storagePath = generatedStoragePath(params.workspaceId, id);
    const bucket = getStorageBucket();
    const contentType = params.mimeType?.trim() || 'application/octet-stream';

    const { error: uploadError } = await createUntypedAdminClient()
      .storage.from(bucket)
      .upload(storagePath, buffer, { contentType, upsert: false });

    if (uploadError) {
      throw new Error(uploadError.message);
    }
  }

  const row = {
    id,
    workspace_id: params.workspaceId,
    astra_key: params.astraKey,
    user_id: params.userId ?? null,
    kind: params.kind,
    title: params.title,
    mime_type: params.mimeType ?? null,
    size_bytes: buffer.byteLength,
    storage_path: storagePath,
    json_payload: params.jsonPayload ?? null,
    job_id: params.jobId ?? null,
    source_key: params.sourceKey ?? null,
    source_metadata: params.sourceMetadata ?? {},
    audit_metadata: params.auditMetadata ?? {},
    artifact_language: normalizeBcp47(params.artifactLanguage) ?? 'en',
  };

  const { data, error } = await createUntypedAdminClient()
    .from('astra_generated_documents')
    .insert(row)
    .select('*')
    .single();

  if (error) {
    if (storagePath) {
      await createUntypedAdminClient().storage.from(getStorageBucket()).remove([storagePath]);
    }
    throw new Error(error.message);
  }

  return data as AstraGeneratedDocumentRow;
}

export async function mergeGeneratedDocuments(params: {
  astraKey: string;
  targetId: string;
  sourceIds: string[];
  expectedRevisions: Record<string, number>;
  title: string;
  jsonPayload: string;
  userId?: string;
}): Promise<AstraGeneratedDocumentRow> {
  const { data, error } = await createUntypedAdminClient().rpc(
    'merge_astra_generated_documents',
    {
      p_astra_key: params.astraKey,
      p_target_id: params.targetId,
      p_source_ids: params.sourceIds,
      p_expected_revisions: params.expectedRevisions,
      p_title: params.title,
      p_json_payload: params.jsonPayload,
      p_user_id: params.userId ?? null,
      p_metadata: { source: 'documents_ui', confirmed_user_intent: true },
    },
  );
  if (error) {
    if (error.message.includes('revision_conflict')) {
      throw new GeneratedDocumentConflictError();
    }
    throw new Error(error.message);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Document not found');
  return row as AstraGeneratedDocumentRow;
}

export async function updateGeneratedDocument(
  astraKey: string,
  id: string,
  patch: { title?: string; jsonPayload?: string },
): Promise<AstraGeneratedDocumentRow> {
  const updates: { title?: string; json_payload?: string } = {};
  if (typeof patch.title === 'string') {
    updates.title = patch.title.trim() || 'Untitled';
  }
  if (typeof patch.jsonPayload === 'string') {
    updates.json_payload = patch.jsonPayload;
  }

  if (Object.keys(updates).length === 0) {
    const { data, error } = await createUntypedAdminClient()
      .from('astra_generated_documents')
      .select('*')
      .eq('astra_key', astraKey)
      .eq('id', id)
      .single();

    if (error) throw new Error(error.message);
    return data as AstraGeneratedDocumentRow;
  }

  const { data, error } = await createUntypedAdminClient()
    .from('astra_generated_documents')
    .update(updates)
    .eq('astra_key', astraKey)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as AstraGeneratedDocumentRow;
}

export async function markGeneratedDocumentRead(
  astraKey: string,
  id: string,
  readAt = new Date(),
): Promise<AstraGeneratedDocumentRow> {
  const { data, error } = await createUntypedAdminClient()
    .from('astra_generated_documents')
    .update({ read_at: readAt.toISOString() })
    .eq('astra_key', astraKey)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as AstraGeneratedDocumentRow;
}

export async function removeGeneratedDocument(astraKey: string, id: string): Promise<void> {
  const supabase = createUntypedAdminClient();
  const { data, error } = await supabase
    .from('astra_generated_documents')
    .select('storage_path')
    .eq('astra_key', astraKey)
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return;

  if (data.storage_path) {
    await supabase.storage.from(getStorageBucket()).remove([data.storage_path]);
  }

  const { error: deleteError } = await supabase
    .from('astra_generated_documents')
    .delete()
    .eq('astra_key', astraKey)
    .eq('id', id);

  if (deleteError) throw new Error(deleteError.message);
}

export async function downloadGeneratedDocument(
  astraKey: string,
  id: string,
): Promise<{ buffer: Buffer | null; mimeType: string | null; jsonPayload: string | null }> {
  const { data, error } = await createUntypedAdminClient()
    .from('astra_generated_documents')
    .select('storage_path, mime_type, json_payload')
    .eq('astra_key', astraKey)
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('Document not found');

  if (!data.storage_path) {
    return { buffer: null, mimeType: data.mime_type, jsonPayload: data.json_payload };
  }

  const { data: blob, error: downloadError } = await createUntypedAdminClient()
    .storage.from(getStorageBucket())
    .download(data.storage_path);

  if (downloadError || !blob) {
    throw new Error(downloadError?.message ?? 'Could not download document');
  }

  const arrayBuffer = await blob.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    mimeType: data.mime_type,
    jsonPayload: data.json_payload,
  };
}
