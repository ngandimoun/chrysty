import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

import { appendJobLog, getBackgroundJob, updateBackgroundJob } from '@/lib/background-jobs/db';
import { ACTIVE_JOB_STATUSES } from '@/lib/background-jobs/types';
import { isKimiConfigured } from '@/lib/kimi/client';
import { isSupabaseConfigured } from '@/lib/supabase/admin';

export function getInternalJobSecret(): string | null {
  return process.env.GENERATION_INTERNAL_SECRET?.trim() || null;
}

export function isBackgroundJobsEnabled(): boolean {
  return isKimiConfigured() && isSupabaseConfigured() && Boolean(getInternalJobSecret());
}

/** Origin explicitly configured via env, or null when none is set. */
export function resolveConfiguredJobOrigin(): string | null {
  const configured = process.env.APP_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl}`;

  return null;
}

/** Base URL used for self-chaining runner invocations. */
export function resolveJobOrigin(requestUrl?: string): string {
  const configured = resolveConfiguredJobOrigin();
  if (configured) return configured;

  if (requestUrl) {
    try {
      return new URL(requestUrl).origin;
    } catch {
      // fall through
    }
  }

  return 'http://localhost:3000';
}

function isLocalHttpsOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    if (url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
    return false;
  } catch {
    return false;
  }
}

function postRunnerKickoff(
  url: string,
  headers: Record<string, string>,
  body: string,
  rejectUnauthorized: boolean,
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const requestFn = parsed.protocol === 'https:' ? httpsRequest : httpRequest;

    const req = requestFn(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        method: 'POST',
        headers: {
          ...headers,
          'Content-Length': Buffer.byteLength(body),
        },
        ...(parsed.protocol === 'https:' ? { rejectUnauthorized } : {}),
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode ?? 500,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Invokes the next runner leg. The runner route replies 202 immediately and does
 * the actual work after the response, so this resolves fast.
 */
export async function kickoffJobLeg(jobId: string, origin: string): Promise<void> {
  const secret = getInternalJobSecret();
  if (!secret) throw new Error('GENERATION_INTERNAL_SECRET is not configured');

  const url = `${origin}/api/astra/background-jobs/run`;
  const headers = {
    'Content-Type': 'application/json',
    'x-internal-secret': secret,
  };
  const body = JSON.stringify({ jobId });

  let statusCode: number;
  let responseText: string;

  if (isLocalHttpsOrigin(origin)) {
    const result = await postRunnerKickoff(url, headers, body, false);
    statusCode = result.statusCode;
    responseText = result.body;
  } else {
    const response = await fetch(url, { method: 'POST', headers, body });
    statusCode = response.status;
    responseText = await response.text().catch(() => '');
  }

  if (statusCode !== 202 && (statusCode < 200 || statusCode >= 300)) {
    throw new Error(`Runner kickoff failed (${statusCode}): ${responseText.slice(0, 200)}`);
  }
}

/** Fire-and-forget variant used when the caller must not fail on kickoff hiccups. */
export function kickoffJobLegSafe(jobId: string, origin: string): void {
  void kickoffJobLeg(jobId, origin).catch(async (error) => {
    console.error(`[background-jobs] kickoff failed for ${jobId}:`, error);
    await recordKickoffFailure(jobId, origin, error).catch(() => {});
  });
}

/**
 * Surfaces a kickoff failure in the job's progress so the UI doesn't show a
 * silently frozen "Queued" forever. The job stays active so stall recovery
 * keeps retrying it.
 */
async function recordKickoffFailure(jobId: string, origin: string, error: unknown): Promise<void> {
  const job = await getBackgroundJob(jobId);
  if (!job || !ACTIVE_JOB_STATUSES.includes(job.status)) return;

  const reason = error instanceof Error ? error.message : String(error);
  const progress = appendJobLog(
    {
      ...job.progress,
      activity: 'Could not reach the job runner — will retry automatically',
    },
    `Kickoff to ${origin} failed: ${reason}`,
  );

  await updateBackgroundJob(jobId, { progress });
}
