import { NextResponse, after } from 'next/server';

import { getInternalJobSecret } from '@/lib/background-jobs/kickoff';
import { runJobLeg } from '@/lib/background-jobs/runner';

export const runtime = 'nodejs';
// Vercel function ceiling; each leg soft-aborts around ASTRA_JOB_LEG_BUDGET_MS (~230s) and chains.
export const maxDuration = 300;

export async function POST(request: Request) {
  const secret = getInternalJobSecret();
  if (!secret) {
    return NextResponse.json({ error: 'Background jobs are not configured' }, { status: 503 });
  }

  if (request.headers.get('x-internal-secret') !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let jobId: string | undefined;
  try {
    const body = (await request.json()) as { jobId?: string };
    jobId = body.jobId?.trim();
  } catch {
    // handled below
  }

  if (!jobId) {
    return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
  }

  const id = jobId;
  // Reply immediately; the leg runs after the response and re-invokes this route when work remains.
  after(async () => {
    await runJobLeg(id);
  });

  return NextResponse.json({ ok: true, jobId: id }, { status: 202 });
}
