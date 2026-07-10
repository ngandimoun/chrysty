import { NextResponse } from 'next/server';

import { requireLiveServiceAuth } from '@/lib/live/auth';
import { loadActiveWorkspaceContext } from '@/lib/live/workspace-context-loader';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const authError = requireLiveServiceAuth(request);
  if (authError) return authError;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const sessionId = typeof body.session_id === 'string' ? body.session_id.trim() : '';
    const astraKey = typeof body.astra_key === 'string' ? body.astra_key.trim() : '';
    if (!sessionId || !astraKey) {
      return NextResponse.json(
        { error: 'session_id and astra_key are required.' },
        { status: 400 },
      );
    }
    const result = await loadActiveWorkspaceContext({
      sessionId,
      astraKey,
      includeFullDocument: body.include_full_document === true,
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'Could not load workspace context.' }, { status: 500 });
  }
}
