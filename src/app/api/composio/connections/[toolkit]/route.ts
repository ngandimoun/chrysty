import { NextResponse, type NextRequest } from 'next/server';

import { isComposioConfigured, revokeConnection } from '@/lib/composio/client';
import { getUserIdFromRequest } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ toolkit: string }> },
) {
  if (!isComposioConfigured()) {
    return NextResponse.json({ error: 'Composio is not configured' }, { status: 503 });
  }

  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { toolkit: rawToolkit } = await context.params;
  const toolkit = decodeURIComponent(rawToolkit).trim().toLowerCase();
  if (!toolkit) {
    return NextResponse.json({ error: 'toolkit is required' }, { status: 400 });
  }

  try {
    await revokeConnection(userId, toolkit);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to disconnect toolkit';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
