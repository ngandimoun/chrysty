import { NextResponse, type NextRequest } from 'next/server';

import {
  getComposioAppOrigin,
  getOrCreateUserSession,
  isComposioConfigured,
} from '@/lib/composio/client';
import { withSharedCookieDomain } from '@/lib/supabase/cookie-options';
import { getUserIdFromRequest } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const PENDING_TOOLKIT_COOKIE = 'composio_pending_toolkit';

export async function POST(request: NextRequest) {
  if (!isComposioConfigured()) {
    return NextResponse.json({ error: 'Composio is not configured' }, { status: 503 });
  }

  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const toolkit =
    body && typeof body === 'object' && !Array.isArray(body)
      ? String((body as { toolkit?: unknown }).toolkit ?? '').trim().toLowerCase()
      : '';

  if (!toolkit || !/^[a-z0-9_-]{1,64}$/.test(toolkit)) {
    return NextResponse.json({ error: 'toolkit is required' }, { status: 400 });
  }

  try {
    const session = await getOrCreateUserSession(userId);
    const origin = getComposioAppOrigin(request.url);
    const callbackUrl = `${origin}/api/composio/callback?toolkit=${encodeURIComponent(toolkit)}`;
    const connectionRequest = await session.authorize(toolkit, { callbackUrl });
    const redirectUrl = connectionRequest.redirectUrl;

    if (!redirectUrl) {
      return NextResponse.json(
        { error: 'Composio did not return a Connect Link' },
        { status: 502 },
      );
    }

    const response = NextResponse.json({ redirectUrl, sessionId: session.sessionId });
    const cookieOptions = withSharedCookieDomain({
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 30,
    });
    response.cookies.set(PENDING_TOOLKIT_COOKIE, toolkit, cookieOptions);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to start authorization';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
