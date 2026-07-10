import { NextResponse } from 'next/server';

import { requireLiveServiceAuth } from '@/lib/live/auth';
import {
  WorkspaceContextError,
  applyActiveDocumentAction,
} from '@/lib/live/workspace-context-loader';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const authError = requireLiveServiceAuth(request);
  if (authError) return authError;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const sessionId = typeof body.session_id === 'string' ? body.session_id.trim() : '';
    const astraKey = typeof body.astra_key === 'string' ? body.astra_key.trim() : '';
    const documentId = typeof body.document_id === 'string' ? body.document_id.trim() : '';
    const action =
      body.action === 'update' || body.action === 'append' || body.action === 'rename'
        ? body.action
        : null;
    const expectedRevision =
      typeof body.expected_revision === 'number' && Number.isSafeInteger(body.expected_revision)
        ? body.expected_revision
        : 0;

    if (!sessionId || !astraKey || !documentId || !action || expectedRevision < 1) {
      return NextResponse.json({ error: 'Invalid document action request.' }, { status: 400 });
    }

    const result = await applyActiveDocumentAction({
      sessionId,
      astraKey,
      documentId,
      expectedRevision,
      action,
      confirmedUserIntent: body.confirmed_user_intent === true,
      content: typeof body.content === 'string' ? body.content : undefined,
      title: typeof body.title === 'string' ? body.title : undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof WorkspaceContextError) {
      const status =
        error.code === 'revision_conflict'
          ? 409
          : error.code === 'session_not_found' || error.code === 'document_not_found'
            ? 404
            : 400;
      return NextResponse.json({ ok: false, code: error.code, error: error.message }, { status });
    }
    return NextResponse.json({ error: 'Could not modify document.' }, { status: 500 });
  }
}
