import { NextResponse } from 'next/server';

import { requireLiveServiceAuth } from '@/lib/live/auth';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const authError = requireLiveServiceAuth(request);
  if (authError) return authError;

  return NextResponse.json({ ok: true });
}
