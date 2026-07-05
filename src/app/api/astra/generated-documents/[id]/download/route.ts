import { NextResponse } from 'next/server';

import { downloadGeneratedDocument } from '@/lib/astra/db/documents';
import { requireAstraIdentity, respondAstraIdentityError } from '@/lib/astra/guard';
import { isSupabaseConfigured } from '@/lib/supabase/admin';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase is not configured' }, { status: 503 });
  }

  try {
    const { id } = await context.params;
    const identity = await requireAstraIdentity(request, { ensureWorkspace: false });
    const downloaded = await downloadGeneratedDocument(identity.astraKey, id);

    if (!downloaded.buffer) {
      return NextResponse.json({
        mimeType: downloaded.mimeType,
        jsonPayload: downloaded.jsonPayload,
      });
    }

    return new NextResponse(new Uint8Array(downloaded.buffer), {
      headers: {
        'Content-Type': downloaded.mimeType ?? 'application/octet-stream',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    const response = respondAstraIdentityError(error);
    if (response) return response;
    const message = error instanceof Error ? error.message : 'Could not download document';
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
