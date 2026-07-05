/**
 * Full background job benchmark — runs diverse real Kimi/Mastra jobs and validates artifacts.
 *
 * Usage:
 *   pnpm test:background-jobs
 *   pnpm test:background-jobs -- --id=chart-market-trends
 *   pnpm test:background-jobs -- https://localhost:3000 --astra-key=ak_...
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), '.env.local');
  try {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    console.error('Missing .env.local — set MOONSHOT_API_KEY and Supabase keys before running.');
    process.exit(1);
  }
}

function parseArg(prefix) {
  const arg = process.argv.find((value) => value.startsWith(`${prefix}=`));
  return arg ? arg.slice(prefix.length + 1) : undefined;
}

function parseOriginArg() {
  const positional = process.argv.find(
    (value) => !value.startsWith('-') && (value.startsWith('http://') || value.startsWith('https://')),
  );
  return positional?.replace(/\/$/, '') || 'https://localhost:3000';
}

function formatSeconds(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}

loadEnvLocal();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const filterId = parseArg('--id');
const astraKey =
  parseArg('--astra-key')?.trim() ||
  process.env.ASTRA_BENCHMARK_KEY?.trim() ||
  'ak_chrysty_benchmark_suite';
const origin = parseOriginArg();

const { createUntypedAdminClient } = await import('../src/lib/supabase/admin.ts');
const { createBackgroundJob, getBackgroundJob } = await import('../src/lib/background-jobs/db.ts');
const { kickoffJobLeg } = await import('../src/lib/background-jobs/kickoff.ts');
const { getBackgroundJobBenchmarkCases } = await import('../src/lib/background-jobs/benchmark-matrix.ts');

const cases = getBackgroundJobBenchmarkCases(filterId);
if (filterId && cases.length === 0) {
  console.error(`No benchmark case found for id: ${filterId}`);
  process.exit(1);
}

console.log(`[background-jobs] Running ${cases.length} case(s) on ${origin}`);
console.log(`[background-jobs] Astra key: ${astraKey}`);
console.log(
  `[background-jobs] To view in UI: localStorage.setItem('chrysty_astra_key', '${astraKey}'); location.reload();\n`,
);

const admin = createUntypedAdminClient();
const { data: workspace, error: wsError } = await admin
  .from('astra_workspaces')
  .upsert({ astra_key: astraKey }, { onConflict: 'astra_key' })
  .select('id')
  .single();

if (wsError || !workspace) {
  console.error(`Workspace setup failed: ${wsError?.message ?? 'unknown'}`);
  process.exit(1);
}

const workspaceId = workspace.id;
const pexelsConfigured = Boolean(process.env.PEXELS_API_KEY?.trim());
const startedAt = Date.now();
const results = [];

for (const testCase of cases) {
  const caseStartedAt = Date.now();
  console.log(`[background-jobs] ▶ ${testCase.id} — ${testCase.title}`);

  let jobId;
  let status = 'fail';
  let error;
  let validation = null;
  let documents = [];
  let lastActivity = '';

  try {
    const job = await createBackgroundJob({
      workspaceId,
      astraKey,
      title: testCase.title,
      objective: testCase.objective,
      origin,
    });
    jobId = job.id;

    await kickoffJobLeg(job.id, origin);
    console.log(`  job ${job.id} kicked off — polling …`);

    while (Date.now() - caseStartedAt < testCase.timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 8_000));
      const current = await getBackgroundJob(job.id);
      if (!current) throw new Error('Job disappeared');

      const activity = current.progress?.activity ?? '';
      if (activity !== lastActivity) {
        lastActivity = activity;
        console.log(`  [${current.status}] ${activity}`);
      }

      if (current.status === 'completed' || current.status === 'failed') {
        const { data: docs } = await admin
          .from('astra_generated_documents')
          .select('id, kind, title, json_payload')
          .eq('job_id', job.id)
          .order('created_at', { ascending: true });

        documents = docs ?? [];
        validation = testCase.validate(documents, { pexelsConfigured });

        if (current.status === 'failed') {
          status = 'fail';
          error = current.error ?? 'Job failed';
        } else if (validation.passed) {
          status = 'pass';
        } else {
          status = 'fail';
          error = validation.checks.filter((check) => !check.passed).map((check) => check.detail).join('; ');
        }
        break;
      }
    }

    if (status === 'fail' && !error && !validation) {
      error = `Timed out after ${formatSeconds(testCase.timeoutMs)}`;
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    status = 'fail';
  }

  const durationMs = Date.now() - caseStartedAt;
  const result = {
    id: testCase.id,
    title: testCase.title,
    status,
    durationMs,
    jobId: jobId ?? null,
    error: error ?? null,
    documentCount: documents.length,
    documents: documents.map((doc) => ({ id: doc.id, kind: doc.kind, title: doc.title })),
    validation: validation ?? { passed: false, checks: [] },
  };
  results.push(result);

  if (status === 'pass') {
    console.log(`[background-jobs] ${testCase.id} PASS ${formatSeconds(durationMs)} (${documents.length} docs)\n`);
  } else {
    console.log(`[background-jobs] ${testCase.id} FAIL ${formatSeconds(durationMs)}`);
    if (error) console.log(`  error: ${error}`);
    if (validation && !validation.passed) {
      for (const check of validation.checks.filter((item) => !item.passed)) {
        console.log(`  fail: ${check.id}: ${check.detail}`);
      }
    }
    console.log('');
  }
}

const passed = results.filter((item) => item.status === 'pass').length;
const failed = results.filter((item) => item.status === 'fail').length;
const totalDurationMs = Date.now() - startedAt;

const report = {
  generatedAt: new Date().toISOString(),
  origin,
  astraKey,
  filterId: filterId ?? null,
  pexelsConfigured,
  summary: { total: results.length, passed, failed, totalDurationMs },
  cases: results,
};

const reportPath = resolve(process.cwd(), 'scripts/background-job-matrix-last.json');
writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log(
  `[background-jobs] Summary: ${passed} passed, ${failed} failed (${formatSeconds(totalDurationMs)} total)`,
);
console.log(`[background-jobs] Report: ${reportPath}`);

process.exit(failed > 0 ? 1 : 0);
