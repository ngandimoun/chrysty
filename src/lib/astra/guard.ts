import { NextResponse } from 'next/server';



import { getAstraKeyFromRequest } from '@/lib/astra/request';

import { ensureAstraWorkspace, resolveCanonicalAstraKey } from '@/lib/astra/workspace';

import { getUserIdFromRequest } from '@/lib/supabase/server';



export class AstraIdentityError extends Error {

  status: number;



  constructor(status: number, message: string) {

    super(message);

    this.status = status;

  }

}



export interface AstraIdentity {

  astraKey: string;

  userId: string;

}



export function respondAstraIdentityError(error: unknown): NextResponse | null {

  if (error instanceof AstraIdentityError) {

    return NextResponse.json({ error: error.message }, { status: error.status });

  }

  return null;

}



export async function requireAstraIdentity(

  request: Request,

  options?: { ensureWorkspace?: boolean },

): Promise<AstraIdentity> {

  const userId = await getUserIdFromRequest(request);



  if (!userId) {

    throw new AstraIdentityError(401, 'Authentication required');

  }



  const headerKey = getAstraKeyFromRequest(request);



  if (headerKey && !headerKey.startsWith('ak_')) {

    throw new AstraIdentityError(400, 'Invalid astra key format');

  }



  let astraKey: string;

  try {

    astraKey = await resolveCanonicalAstraKey(userId, headerKey);

  } catch (error) {

    const message = error instanceof Error ? error.message : 'Invalid astra key';

    const status = message.includes('not available') ? 403 : 400;

    throw new AstraIdentityError(status, message);

  }



  if (options?.ensureWorkspace !== false) {

    await ensureAstraWorkspace(astraKey, userId);

  }



  return { astraKey, userId };

}


