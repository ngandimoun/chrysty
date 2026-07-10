import { NextResponse } from 'next/server';

import {
  addGeneratedDocument,
  listGeneratedDocuments,
  markGeneratedDocumentRead,
  removeGeneratedDocument,
  mutateGeneratedDocument,
  mergeGeneratedDocuments,
  GeneratedDocumentConflictError,
} from '@/lib/astra/db/documents';
import { requireAstraIdentity, respondAstraIdentityError } from '@/lib/astra/guard';
import { ensureAstraWorkspace } from '@/lib/astra/workspace';
import type { GeneratedDocumentKind } from '@/lib/documents/generated-document-types';
import { getDocumentFullText } from '@/lib/documents/document-content';
import {
  buildDocumentMergePreview,
  requireConfirmedMerge,
  type DocumentMergePreview,
} from '@/lib/documents/living-document';
import { isSupabaseConfigured } from '@/lib/supabase/admin';

function toClientRow(row: Awaited<ReturnType<typeof listGeneratedDocuments>>[number]) {
  return {
    id: row.id,
    kind: row.kind as GeneratedDocumentKind,
    title: row.title,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
    readAt: row.read_at ? new Date(row.read_at).getTime() : null,
    mimeType: row.mime_type ?? undefined,
    jsonPayload: row.json_payload ?? undefined,
    hasBlob: Boolean(row.storage_path),
    jobId: row.job_id ?? undefined,
    revision: row.revision,
    sourceKey: row.source_key,
    sourceMetadata: row.source_metadata,
    auditMetadata: row.audit_metadata,
    artifactLanguage: row.artifact_language || 'en',
  };
}

async function previewMerge(astraKey: string, documentIds: string[]): Promise<DocumentMergePreview> {
  const uniqueIds = [...new Set(documentIds.map((id) => id.trim()).filter(Boolean))];
  const owned = (await listGeneratedDocuments(astraKey)).filter((row) => uniqueIds.includes(row.id));
  if (owned.length !== uniqueIds.length) throw new Error('One or more documents were not found.');
  return buildDocumentMergePreview(
    owned.map((row) => ({
      id: row.id,
      title: row.title,
      kind: row.kind,
      createdAt: new Date(row.created_at).getTime(),
      updatedAt: new Date(row.updated_at).getTime(),
      revision: row.revision,
      fullText: getDocumentFullText({
        id: row.id,
        kind: row.kind as GeneratedDocumentKind,
        title: row.title,
        createdAt: new Date(row.created_at).getTime(),
        updatedAt: new Date(row.updated_at).getTime(),
        jsonPayload: row.json_payload ?? undefined,
        revision: row.revision,
      }),
    })),
  );
}

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ documents: [] });
  }

  try {
    const identity = await requireAstraIdentity(request);
    const documents = await listGeneratedDocuments(identity.astraKey);
    return NextResponse.json({ documents: documents.map(toClientRow) });
  } catch (error) {
    const response = respondAstraIdentityError(error);
    if (response) return response;
    const message = error instanceof Error ? error.message : 'Could not list documents';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase is not configured' }, { status: 503 });
  }

  try {
    const identity = await requireAstraIdentity(request);
    const workspace = await ensureAstraWorkspace(identity.astraKey, identity.userId);
    const contentType = request.headers.get('content-type') ?? '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const kind = String(formData.get('kind') ?? 'other');
      const title = String(formData.get('title') ?? 'Untitled');
      const mimeType = String(formData.get('mimeType') ?? '').trim() || undefined;
      const jsonPayload = String(formData.get('jsonPayload') ?? '').trim() || undefined;
      const id = String(formData.get('id') ?? '').trim() || undefined;
      const artifactLanguage = String(formData.get('artifactLanguage') ?? '').trim() || undefined;
      const file = formData.get('file');
      const buffer =
        file instanceof File ? Buffer.from(await file.arrayBuffer()) : undefined;

      const created = await addGeneratedDocument({
        workspaceId: workspace.id,
        astraKey: identity.astraKey,
        userId: identity.userId,
        id,
        kind,
        title,
        mimeType: mimeType ?? (file instanceof File ? file.type : undefined),
        jsonPayload,
        buffer,
        artifactLanguage,
      });

      return NextResponse.json({ document: toClientRow(created) });
    }

    const body = (await request.json()) as {
      id?: string;
      kind?: string;
      title?: string;
      mimeType?: string;
      jsonPayload?: string;
      artifactLanguage?: string;
    };

    const created = await addGeneratedDocument({
      workspaceId: workspace.id,
      astraKey: identity.astraKey,
      userId: identity.userId,
      id: body.id,
      kind: body.kind ?? 'other',
      title: body.title ?? 'Untitled',
      mimeType: body.mimeType,
      jsonPayload: body.jsonPayload,
      artifactLanguage: body.artifactLanguage,
    });

    return NextResponse.json({ document: toClientRow(created) });
  } catch (error) {
    const response = respondAstraIdentityError(error);
    if (response) return response;
    const message = error instanceof Error ? error.message : 'Could not add document';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase is not configured' }, { status: 503 });
  }

  try {
    const identity = await requireAstraIdentity(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id')?.trim();
    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    }

    await removeGeneratedDocument(identity.astraKey, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const response = respondAstraIdentityError(error);
    if (response) return response;
    const message = error instanceof Error ? error.message : 'Could not remove document';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase is not configured' }, { status: 503 });
  }
  try {
    const identity = await requireAstraIdentity(request);
    const body = (await request.json()) as { action?: string; documentIds?: string[] };
    if (body.action !== 'merge-preview' || !Array.isArray(body.documentIds)) {
      return NextResponse.json({ error: 'Invalid merge preview request.' }, { status: 400 });
    }
    return NextResponse.json({ preview: await previewMerge(identity.astraKey, body.documentIds) });
  } catch (error) {
    const response = respondAstraIdentityError(error);
    if (response) return response;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not preview merge' },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase is not configured' }, { status: 503 });
  }

  try {
    const identity = await requireAstraIdentity(request);
    const body = (await request.json()) as {
      action?: string;
      confirmed?: boolean;
      preview?: DocumentMergePreview;
      id?: string;
      readAt?: number;
      title?: string;
      jsonPayload?: string;
      expectedRevision?: number;
    };
    if (body.action === 'merge') {
      requireConfirmedMerge(body.confirmed === true);
      const requested = body.preview;
      if (!requested) {
        return NextResponse.json({ error: 'Merge preview is required.' }, { status: 400 });
      }
      const currentPreview = await previewMerge(identity.astraKey, [
        requested.targetId,
        ...requested.sourceIds,
      ]);
      const revisionsMatch = Object.entries(currentPreview.expectedRevisions).every(
        ([id, revision]) => requested.expectedRevisions[id] === revision,
      );
      if (!revisionsMatch) throw new GeneratedDocumentConflictError();
      const document = await mergeGeneratedDocuments({
        astraKey: identity.astraKey,
        targetId: currentPreview.targetId,
        sourceIds: currentPreview.sourceIds,
        expectedRevisions: currentPreview.expectedRevisions,
        title: currentPreview.title,
        jsonPayload: JSON.stringify({ fullText: currentPreview.markdown }),
        userId: identity.userId,
      });
      return NextResponse.json({ document: toClientRow(document) });
    }
    const id = body.id?.trim();
    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    }

    const hasContentUpdate =
      typeof body.title === 'string' || typeof body.jsonPayload === 'string';

    if (hasContentUpdate) {
      if (!Number.isSafeInteger(body.expectedRevision) || (body.expectedRevision ?? 0) < 1) {
        return NextResponse.json({ error: 'expectedRevision is required.' }, { status: 400 });
      }
      const document = await mutateGeneratedDocument({
        astraKey: identity.astraKey,
        documentId: id,
        expectedRevision: body.expectedRevision!,
        action: 'update',
        title: body.title,
        jsonPayload: body.jsonPayload,
        userId: identity.userId,
        sessionId: 'manual-ui',
        metadata: { source: 'generated_document_viewer' },
      });
      return NextResponse.json({ document: toClientRow(document) });
    }

    const readAt =
      typeof body.readAt === 'number' && Number.isFinite(body.readAt)
        ? new Date(body.readAt)
        : new Date();
    const document = await markGeneratedDocumentRead(identity.astraKey, id, readAt);
    return NextResponse.json({ document: toClientRow(document) });
  } catch (error) {
    const response = respondAstraIdentityError(error);
    if (response) return response;
    const message = error instanceof Error ? error.message : 'Could not update document';
    return NextResponse.json(
      { error: message },
      { status: error instanceof GeneratedDocumentConflictError ? 409 : 500 },
    );
  }
}
