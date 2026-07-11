import { NextResponse, type NextRequest } from 'next/server';

import {
  getOrCreateUserSession,
  isComposioConfigured,
  listActiveConnections,
  type ComposioConnectionRow,
} from '@/lib/composio/client';
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

  const search = request.nextUrl.searchParams.get('q')?.trim() || undefined;

  try {
    const session = await getOrCreateUserSession(userId);
    const [toolkits, connections] = await Promise.all([
      session.toolkits(search ? { search } : undefined),
      listActiveConnections(userId),
    ]);

    const connectedBySlug = new Map(
      connections.map((row: ComposioConnectionRow) => [row.toolkit_slug, row]),
    );

    const items = toolkits.items.map((item: {
      slug: string;
      name: string;
      logo?: string;
      isNoAuth: boolean;
      connection?: {
        connectedAccount?: { id: string } | undefined;
      } | undefined;
    }) => {
      const local = connectedBySlug.get(item.slug);
      const remoteConnected = Boolean(item.connection?.connectedAccount?.id);
      const connected = Boolean(local) || remoteConnected || item.isNoAuth;

      return {
        slug: item.slug,
        name: item.name,
        logo: item.logo ?? local?.logo_url ?? null,
        isNoAuth: item.isNoAuth,
        connected,
        connectedAccountId:
          local?.connected_account_id ?? item.connection?.connectedAccount?.id ?? null,
      };
    });

    return NextResponse.json({
      items,
      cursor: toolkits.cursor ?? null,
      totalPages: toolkits.totalPages,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list toolkits';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
