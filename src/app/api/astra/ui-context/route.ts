import { NextResponse } from 'next/server';

import { getGeneratedDocument } from '@/lib/astra/db/documents';
import { requireAstraIdentity, respondAstraIdentityError } from '@/lib/astra/guard';
import { getLiveSession, patchLiveSessionForAstraKey } from '@/lib/live/db';
import { compactWorkspaceUiContext } from '@/lib/live/workspace-context';

export const runtime = 'nodejs';

async function resolveOwnedSession(request: Request, sessionId: string) {
  const identity = await requireAstraIdentity(request);
  const session = await getLiveSession(sessionId);
  if (!session || session.astra_key !== identity.astraKey) {
    return { response: NextResponse.json({ error: 'Live session not found.' }, { status: 404 }) };
  }
  return { identity, session };
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const sessionId = typeof body.session_id === 'string' ? body.session_id.trim() : '';
    if (!sessionId) {
      return NextResponse.json({ error: 'session_id is required.' }, { status: 400 });
    }

    const owned = await resolveOwnedSession(request, sessionId);
    if ('response' in owned) return owned.response;

    let context = compactWorkspaceUiContext(body.ui_context);
    if (!context) {
      return NextResponse.json({ error: 'Invalid ui_context.' }, { status: 400 });
    }

    if (context.source === 'generated_document') {
      if (!context.document_id) {
        return NextResponse.json({ error: 'document_id is required.' }, { status: 400 });
      }
      const document = await getGeneratedDocument(owned.identity.astraKey, context.document_id);
      if (!document) {
        return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
      }
      context = {
        ...context,
        title: document.title.slice(0, 160),
        revision: document.revision,
        saved: true,
      };
    }

    await patchLiveSessionForAstraKey(sessionId, owned.identity.astraKey, {
      ui_context: context,
    });
    return NextResponse.json({ ui_context: context });
  } catch (error) {
    const identityResponse = respondAstraIdentityError(error);
    if (identityResponse) return identityResponse;
    return NextResponse.json({ error: 'Could not update UI context.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const sessionId = new URL(request.url).searchParams.get('session_id')?.trim() ?? '';
    if (!sessionId) {
      return NextResponse.json({ error: 'session_id is required.' }, { status: 400 });
    }
    const owned = await resolveOwnedSession(request, sessionId);
    if ('response' in owned) return owned.response;
    await patchLiveSessionForAstraKey(sessionId, owned.identity.astraKey, { ui_context: null });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const identityResponse = respondAstraIdentityError(error);
    if (identityResponse) return identityResponse;
    return NextResponse.json({ error: 'Could not clear UI context.' }, { status: 500 });
  }
}
