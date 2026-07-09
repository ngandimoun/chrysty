import { NextResponse } from 'next/server';

import { getAstraKeyFromRequest } from '@/lib/astra/request';
import { ensureAstraWorkspace, resolveCanonicalAstraKey } from '@/lib/astra/workspace';
import { getUserIdFromRequest } from '@/lib/supabase/server';

export interface LiveAstraIdentity {
  astraKey: string;
  userId: string;
  workspaceId: string;
}

export async function resolveLiveAstraIdentity(
  request: Request,
  astraKeyRaw?: string,
): Promise<LiveAstraIdentity | NextResponse> {
  const userId = (await getUserIdFromRequest(request)) ?? '';
  const headerKey = getAstraKeyFromRequest(request);
  const candidateKey = astraKeyRaw?.trim() || headerKey;

  if (!candidateKey?.startsWith('ak_')) {
    return NextResponse.json({ error: 'Invalid astra key.' }, { status: 400 });
  }

  try {
    const astraKey = await resolveCanonicalAstraKey(userId || undefined, candidateKey);
    const workspace = await ensureAstraWorkspace(astraKey, userId || undefined);
    return {
      astraKey,
      userId,
      workspaceId: workspace.id,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid astra key.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
