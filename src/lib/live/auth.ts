import { NextResponse } from 'next/server';

export function getLiveServiceInternalSecret(): string | null {
  return process.env.LIVE_SERVICE_INTERNAL_SECRET?.trim() || null;
}

export function isLiveServiceRequest(request: Request): boolean {
  const secret = getLiveServiceInternalSecret();
  if (!secret) return false;
  return request.headers.get('x-internal-secret') === secret;
}

export function requireLiveServiceAuth(request: Request): NextResponse | null {
  if (!getLiveServiceInternalSecret()) {
    return NextResponse.json({ error: 'Live service is not configured.' }, { status: 503 });
  }
  if (!isLiveServiceRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  return null;
}
