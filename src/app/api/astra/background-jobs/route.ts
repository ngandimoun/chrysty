import { NextResponse } from 'next/server';

import {
  isJobStalled,
  listBackgroundJobs,
  markBackgroundJobsSeen,
} from '@/lib/background-jobs/db';
import { isBackgroundJobsEnabled, kickoffJobLegSafe, resolveJobOrigin } from '@/lib/background-jobs/kickoff';
import { toBackgroundJobClientItem } from '@/lib/background-jobs/types';
import { requireAstraIdentity, respondAstraIdentityError } from '@/lib/astra/guard';
import { isSupabaseConfigured } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ jobs: [], enabled: false });
  }

  try {
    const identity = await requireAstraIdentity(request, { ensureWorkspace: false });
    const jobs = await listBackgroundJobs(identity.astraKey);

    // Revive jobs whose leg died without chaining (e.g. worker crash).
    // Prefer the currently resolved origin over the one stored on the job row:
    // the stored origin may be stale/wrong (e.g. http vs https), which would
    // make every revival attempt fail forever.
    if (isBackgroundJobsEnabled()) {
      for (const job of jobs) {
        if (isJobStalled(job)) {
          kickoffJobLegSafe(job.id, resolveJobOrigin(request.url));
        }
      }
    }

    return NextResponse.json({
      jobs: jobs.map(toBackgroundJobClientItem),
      enabled: isBackgroundJobsEnabled(),
    });
  } catch (error) {
    const response = respondAstraIdentityError(error);
    if (response) return response;
    const message = error instanceof Error ? error.message : 'Could not list jobs';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase is not configured' }, { status: 503 });
  }

  try {
    const identity = await requireAstraIdentity(request, { ensureWorkspace: false });
    const body = (await request.json()) as { seenJobIds?: string[] };
    const seenJobIds = Array.isArray(body.seenJobIds)
      ? body.seenJobIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
      : [];

    await markBackgroundJobsSeen(identity.astraKey, seenJobIds);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const response = respondAstraIdentityError(error);
    if (response) return response;
    const message = error instanceof Error ? error.message : 'Could not update jobs';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
