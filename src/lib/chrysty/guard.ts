import { auth, billing } from '@chrysty/platform';
import type { NextRequest } from 'next/server';

import { WORKER_SLUG } from '@/lib/chrysty/constants';
import { configurePlatformForToken } from '@/lib/chrysty/platform';
import { getServerSession } from '@/lib/chrysty/server-session';

export class PlatformAccessError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
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
    throw new PlatformAccessError(403, access.reason ?? 'Access denied for this worker');
  }

  return authResult;
}

export async function requirePlatformAccessFromRequest(request: Request) {
  return requirePlatformAccess(request as NextRequest);
}
