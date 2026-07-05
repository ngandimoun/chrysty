/**
 * Re-validate jobs from the last benchmark report (no new kickoffs).
 * Usage: pnpm tsx scripts/validate-background-job-report.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnvLocal() {
  for (const line of readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvLocal();

const reportPath = resolve(process.cwd(), 'scripts/background-job-matrix-last.json');
const report = JSON.parse(readFileSync(reportPath, 'utf8'));

const { getBackgroundJobBenchmarkCases } = await import('../src/lib/background-jobs/benchmark-matrix.ts');
const { getBackgroundJob } = await import('../src/lib/background-jobs/db.ts');
const { createUntypedAdminClient } = await import('../src/lib/supabase/admin.ts');

const admin = createUntypedAdminClient();
const pexelsConfigured = Boolean(process.env.PEXELS_API_KEY?.trim());
const caseById = new Map(getBackgroundJobBenchmarkCases().map((item) => [item.id, item]));

console.log('[validate-report] Checking jobs from last benchmark run …\n');

let passed = 0;
let failed = 0;

for (const entry of report.cases) {
  if (!entry.jobId) continue;
  const testCase = caseById.get(entry.id);
  if (!testCase) continue;

  const job = await getBackgroundJob(entry.jobId);
  const { data: docs } = await admin
    .from('astra_generated_documents')
    .select('id, kind, title, json_payload')
    .eq('job_id', entry.jobId)
    .order('created_at', { ascending: true });

  const documents = docs ?? [];
  const validation =
    job?.status === 'completed'
      ? testCase.validate(documents, { pexelsConfigured })
      : { passed: false, checks: [{ id: 'status', passed: false, detail: `status=${job?.status ?? 'missing'}` }] };

  if (validation.passed) {
    passed += 1;
    console.log(`[validate-report] ${entry.id} PASS (${documents.length} docs, status=${job?.status})`);
  } else {
    failed += 1;
    console.log(`[validate-report] ${entry.id} FAIL status=${job?.status} docs=${documents.length}`);
    for (const check of validation.checks.filter((item) => !item.passed)) {
      console.log(`  fail: ${check.id}: ${check.detail}`);
    }
  }
}

console.log(`\n[validate-report] ${passed} passed, ${failed} failed / ${report.cases.length} cases`);
process.exit(failed > 0 ? 1 : 0);
