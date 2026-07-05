import { NextResponse } from 'next/server';

import {
  getBackgroundJobForKey,
  listJobDocuments,
  requestBackgroundJobCancel,
} from '@/lib/background-jobs/db';
import { toBackgroundJobClientItem } from '@/lib/background-jobs/types';
import { requireAstraIdentity, respondAstraIdentityError } from '@/lib/astra/guard';
import { isSupabaseConfigured } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase is not configured' }, { status: 503 });
  }

  try {
    const identity = await requireAstraIdentity(request, { ensureWorkspace: false });
    const { id } = await params;
    const job = await getBackgroundJobForKey(identity.astraKey, id);
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const documents = await listJobDocuments(identity.astraKey, id);
    return NextResponse.json({
      job: toBackgroundJobClientItem(job),
      documents: documents.map((doc) => ({
        id: doc.id,
        kind: doc.kind,
        title: doc.title,
        createdAt: new Date(doc.created_at).getTime(),
      })),
    });
  } catch (error) {
    const response = respondAstraIdentityError(error);
    if (response) return response;
    const message = error instanceof Error ? error.message : 'Could not load job';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase is not configured' }, { status: 503 });
  }

  try {
    const identity = await requireAstraIdentity(request, { ensureWorkspace: false });
    const { id } = await params;
    const job = await requestBackgroundJobCancel(identity.astraKey, id);
    if (!job) {
      return NextResponse.json({ error: 'Job is not active' }, { status: 409 });
    }

    return NextResponse.json({ job: toBackgroundJobClientItem(job) });
  } catch (error) {
    const response = respondAstraIdentityError(error);
    if (response) return response;
    const message = error instanceof Error ? error.message : 'Could not cancel job';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
