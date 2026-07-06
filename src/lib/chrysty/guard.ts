import { auth, billing } from '@chrysty/platform';
import type { CheckAccessResponse } from '@chrysty/platform';
import { NextResponse, type NextRequest } from 'next/server';

import { WORKER_SLUG } from '@/lib/chrysty/constants';
import { configurePlatformForToken } from '@/lib/chrysty/platform';
import { getServerSession } from '@/lib/chrysty/server-session';

const WEBSITE_URL = 'https://chrysty.dev';

function getBillingRedirectUrl(reason?: CheckAccessResponse['reason']): string {
  const base = `${WEBSITE_URL.replace(/\/$/, '')}/templates`;
  if (reason === 'no_subscription' || reason === 'worker_not_included') {
    return `${base}?subscribe=1`;
  }
  if (reason === 'past_due') return `${base}?billing=past_due`;
  if (reason === 'quota_exceeded') return `${base}?billing=quota`;
  return base;
}

export class PlatformAccessError extends Error {
  status: number;
  reason?: CheckAccessResponse['reason'];
  redirectUrl?: string;

  constructor(
    status: number,
    message: string,
    options?: { reason?: CheckAccessResponse['reason']; redirectUrl?: string }
  ) {
    super(message);
    this.status = status;
    this.reason = options?.reason;
    this.redirectUrl = options?.redirectUrl;
  }
}

export function respondPlatformAccessError(error: unknown): NextResponse | null {
  if (error instanceof PlatformAccessError) {
    return NextResponse.json(
      {
        error: error.message,
        reason: error.reason,
        redirectUrl: error.redirectUrl,
      },
      { status: error.status }
    );
  }
  return null;
}

export async function requireAuthenticatedUser(request: NextRequest) {
  const session = await getServerSession(request);

  if (!session?.access_token) {
    throw new PlatformAccessError(401, 'Authentication required');
  }

  configurePlatformForToken(session.access_token);

  const verification = await auth.verifyToken();
  if (!verification.valid || !verification.user) {
    throw new PlatformAccessError(401, 'Invalid session');
  }

  return { session, user: verification.user };
}

export async function requirePlatformAccess(request: NextRequest) {
  const authResult = await requireAuthenticatedUser(request);

  const access = await billing.checkAccess({
    workerSlug: WORKER_SLUG,
    actionType: 'ai_completion',
  });

  if (!access.allowed) {
    throw new PlatformAccessError(403, access.reason ?? 'Access denied for this worker', {
      reason: access.reason,
      redirectUrl: getBillingRedirectUrl(access.reason),
    });
  }

  return authResult;
}

export async function requirePlatformAccessFromRequest(request: Request) {
  return requirePlatformAccess(request as NextRequest);
}
