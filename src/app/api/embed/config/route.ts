import { NextResponse } from 'next/server';

import { embedCorsHeaders, withEmbedCors } from '@/lib/embed/cors';
import { isGeminiLiveEnabled, getLiveWebSocketUrl } from '@/lib/gemini/config';

export const runtime = 'nodejs';

export async function OPTIONS(request: Request) {
  const origin = request.headers.get('origin');
  return new NextResponse(null, {
    status: 204,
    headers: embedCorsHeaders(origin),
  });
}

export async function GET(request: Request) {
  const origin = request.headers.get('origin');
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || 'https://chrysty.chrysty.dev';

  return withEmbedCors(
    NextResponse.json({
      embedLiveUrl: `${appUrl.replace(/\/$/, '')}/embed/live`,
      liveEnabled: isGeminiLiveEnabled() && Boolean(getLiveWebSocketUrl()),
    }),
    origin,
  );
}
