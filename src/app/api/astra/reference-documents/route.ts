import { NextResponse } from 'next/server';

import {
  addReferenceDocument,
  listReferenceDocuments,
  removeReferenceDocument,
} from '@/lib/astra/db/documents';
import { requireAstraIdentity, respondAstraIdentityError } from '@/lib/astra/guard';
import { ensureAstraWorkspace } from '@/lib/astra/workspace';
import { isSupabaseConfigured } from '@/lib/supabase/admin';

function toClientRow(row: Awaited<ReturnType<typeof listReferenceDocuments>>[number]) {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    mimeType: row.mime_type,
    size: row.size_bytes,
    createdAt: new Date(row.created_at).getTime(),
  };
}

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ documents: [] });
  }

  try {
    const identity = await requireAstraIdentity(request);
    const documents = await listReferenceDocuments(identity.astraKey);
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
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const created = await addReferenceDocument({
      workspaceId: workspace.id,
      astraKey: identity.astraKey,
      userId: identity.userId,
      name: file.name,
      mimeType: file.type,
      buffer,
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

    await removeReferenceDocument(identity.astraKey, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const response = respondAstraIdentityError(error);
    if (response) return response;
    const message = error instanceof Error ? error.message : 'Could not remove document';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
