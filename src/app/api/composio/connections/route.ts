import { NextResponse, type NextRequest } from 'next/server';

import { isComposioConfigured, listActiveConnections } from '@/lib/composio/client';
import { getUserIdFromRequest } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  if (!isComposioConfigured()) {
    return NextResponse.json({ error: 'Composio is not configured' }, { status: 503 });
  }

  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const connections = await listActiveConnections(userId);
    return NextResponse.json({
      items: connections.map((row) => ({
        slug: row.toolkit_slug,
        name: row.toolkit_name,
        logo: row.logo_url,
        connectedAccountId: row.connected_account_id,
        sessionId: row.session_id,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list connections';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
