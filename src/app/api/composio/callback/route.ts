import { NextResponse, type NextRequest } from 'next/server';

import {
  buildConnectedAccountsMap,
  getComposioAppOrigin,
  getOrCreateUserSession,
  isComposioConfigured,
  listActiveConnections,
  upsertConnection,
} from '@/lib/composio/client';
import { getUserIdFromRequest } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const PENDING_TOOLKIT_COOKIE = 'composio_pending_toolkit';

function redirectHome(origin: string, status: 'connected' | 'error', toolkit?: string) {
  const url = new URL('/', origin);
  url.searchParams.set('composio', status);
  if (toolkit) {
    url.searchParams.set('toolkit', toolkit);
  }
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const origin = getComposioAppOrigin(request.url);

  if (!isComposioConfigured()) {
    return redirectHome(origin, 'error');
  }

  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return redirectHome(origin, 'error');
  }

  const status = request.nextUrl.searchParams.get('status')?.trim().toLowerCase();
  const connectedAccountId = request.nextUrl.searchParams.get('connected_account_id')?.trim();
  const toolkitFromQuery = request.nextUrl.searchParams.get('toolkit')?.trim().toLowerCase();
  const toolkitFromCookie = request.cookies.get(PENDING_TOOLKIT_COOKIE)?.value?.trim().toLowerCase();
  const toolkit = toolkitFromQuery || toolkitFromCookie || '';

  if (status !== 'success' || !connectedAccountId || !toolkit) {
    const response = redirectHome(origin, 'error', toolkit || undefined);
    response.cookies.delete(PENDING_TOOLKIT_COOKIE);
    return response;
  }

  try {
    const session = await getOrCreateUserSession(userId);

    let toolkitName: string | null = null;
    let logoUrl: string | null = null;
    try {
      const listed = await session.toolkits({ toolkits: [toolkit] });
      const match = listed.items.find((item: { slug: string; name: string; logo?: string }) => item.slug === toolkit);
      toolkitName = match?.name ?? null;
      logoUrl = match?.logo ?? null;
    } catch {
      // Metadata is optional for persistence.
    }

    await upsertConnection({
      userId,
      toolkitSlug: toolkit,
      toolkitName,
      logoUrl,
      connectedAccountId,
      sessionId: session.sessionId,
    });

    const connections = await listActiveConnections(userId);
    const connectedAccounts = buildConnectedAccountsMap(connections);
    // Ensure the just-connected account is present even if list is briefly stale.
    connectedAccounts[toolkit] = [connectedAccountId];
    const toolkits = Object.keys(connectedAccounts);

    await session.update({
      manageConnections: false,
      toolkits,
      connectedAccounts,
    });

    const response = redirectHome(origin, 'connected', toolkit);
    response.cookies.delete(PENDING_TOOLKIT_COOKIE);
    return response;
  } catch {
    const response = redirectHome(origin, 'error', toolkit);
    response.cookies.delete(PENDING_TOOLKIT_COOKIE);
    return response;
  }
}
