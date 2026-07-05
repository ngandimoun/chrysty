/**
 * End-to-end smoke test for voice-delegated background jobs.
 *
 * Requires the dev server to be running (pnpm dev / pnpm dev:https) and
 * MOONSHOT_API_KEY + Supabase + GENERATION_INTERNAL_SECRET in .env.local.
 *
 * Usage: pnpm tsx scripts/test-background-job.ts [origin]
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function loadEnvLocal() {
  const envPath = join(process.cwd(), '.env.local');
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

async function main() {
  loadEnvLocal();
  // Local dev server uses a self-signed certificate.
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  const origin = process.argv[2]?.trim() || 'https://localhost:3000';
  const astraKey = 'ak_backgroundjob_smoke_test';

  const { createUntypedAdminClient } = await import('@/lib/supabase/admin');
  const { createBackgroundJob, getBackgroundJob } = await import('@/lib/background-jobs/db');
  const { kickoffJobLeg } = await import('@/lib/background-jobs/kickoff');

  const admin = createUntypedAdminClient();
  const { data: workspace, error: wsError } = await admin
    .from('astra_workspaces')
    .upsert({ astra_key: astraKey }, { onConflict: 'astra_key' })
    .select('id')
    .single();
  if (wsError || !workspace) throw new Error(`Workspace setup failed: ${wsError?.message}`);

  const job = await createBackgroundJob({
    workspaceId: (workspace as { id: string }).id,
    astraKey,
    title: 'Smoke test briefing',
    objective:
      'Create a short one-page markdown briefing about the Eiffel Tower with exactly 3 fun facts and a small comparison table of its height versus 2 other landmarks. Keep it brief; this is a smoke test.',
    origin,
  });
  console.log(`Created job ${job.id}. Kicking off first leg via ${origin} ...`);

  await kickoffJobLeg(job.id, origin);
  console.log('Kickoff accepted. Polling ...');

  const startedAt = Date.now();
  const timeoutMs = 8 * 60_000;
  let lastActivity = '';

  while (Date.now() - startedAt < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 8_000));
    const current = await getBackgroundJob(job.id);
    if (!current) throw new Error('Job disappeared');

    const activity = current.progress?.activity ?? '';
    if (activity !== lastActivity) {
      lastActivity = activity;
      console.log(`[${current.status}] ${activity}`);
    }

    if (current.status === 'completed') {
      console.log('\n=== COMPLETED ===');
      console.log('Summary:', current.result_summary);
      console.log('Documents:', current.document_ids);
      const { data: docs } = await admin
        .from('astra_generated_documents')
        .select('id, kind, title')
        .eq('job_id', job.id);
      console.log('Document rows:', docs);
      return;
    }
    if (current.status === 'failed') {
      console.error('\n=== FAILED ===');
      console.error('Error:', current.error);
      process.exitCode = 1;
      return;
    }
  }

  console.error('Timed out waiting for job to finish.');
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
