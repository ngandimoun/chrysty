/**
 * Gemini delegation routing benchmark — verifies delegate vs direct response decisions.
 *
 * Usage:
 *   pnpm test:delegation
 *   pnpm test:delegation -- --id=delegate-research-report
 */
import { readFileSync, writeFileSync } from 'node:fs';
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
    console.error('Missing .env.local — set GEMINI_API_KEY before running.');
    process.exit(1);
  }
}

function parseArg(prefix) {
  const arg = process.argv.find((value) => value.startsWith(`${prefix}=`));
  return arg ? arg.slice(prefix.length + 1) : undefined;
}

function formatSeconds(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatStatus(status) {
  if (status === 'passWithWarning') return 'PASS*';
  if (status === 'skipped') return 'SKIP';
  return status.toUpperCase();
}

loadEnvLocal();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const { GoogleGenAI } = await import('@google/genai');
const { getGeminiApiKey } = await import('../src/lib/gemini/config.ts');
const { BENCHMARK_ASTRA_KEY } = await import('../src/lib/background-jobs/benchmark-matrix.ts');
const {
  getDelegationMatrixEntries,
  isDelegationMatrixEnabled,
} = await import('../src/lib/gemini/delegation-test-matrix.ts');
const { runToolMatrixCaseWithRetry } = await import('../src/lib/gemini/tool-test-harness.ts');
const { createUntypedAdminClient } = await import('../src/lib/supabase/admin.ts');

if (!isDelegationMatrixEnabled()) {
  console.log('[delegation] SKIP — background jobs not configured (MOONSHOT_API_KEY, Supabase, GENERATION_INTERNAL_SECRET)');
  process.exit(0);
}

const filterId = parseArg('--id');
const astraKey = parseArg('--astra-key')?.trim() || process.env.ASTRA_BENCHMARK_KEY?.trim() || BENCHMARK_ASTRA_KEY;
const origin =
  process.argv.find(
    (value) => !value.startsWith('-') && (value.startsWith('http://') || value.startsWith('https://')),
  )?.replace(/\/$/, '') || 'https://localhost:3000';

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

const delegation = {
  toolContext: {
    astraKey,
    workspaceId: workspace.id,
    origin,
  },
  jobSummaries: [],
};

const entries = getDelegationMatrixEntries(delegation, filterId);
if (filterId && entries.length === 0) {
  console.error(`No delegation case found for id: ${filterId}`);
  process.exit(1);
}

const client = new GoogleGenAI({ apiKey: getGeminiApiKey() });
console.log(`[delegation] Running ${entries.length} case(s) with astra key ${astraKey}\n`);

const results = [];
const startedAt = Date.now();

for (const entry of entries) {
  const result = await runToolMatrixCaseWithRetry(client, entry.case, entry.expect);
  results.push(result);

  const status = formatStatus(result.status);
  const custom = result.customToolCalls.join(',') || 'none';
  const line = `[delegation] ${result.id} ${status} ${formatSeconds(result.durationMs)} custom=${custom}`;

  if (result.status === 'fail') {
    console.log(line);
    if (result.error) console.log(`  error: ${result.error}`);
    for (const failure of result.failures) console.log(`  fail: ${failure}`);
  } else {
    console.log(line);
    if (result.spokenPreview) console.log(`  spoken: ${result.spokenPreview.slice(0, 120)}`);
    for (const warning of result.warnings) console.log(`  warn: ${warning}`);
  }
}

const passed = results.filter((r) => r.status === 'pass' || r.status === 'passWithWarning').length;
const failed = results.filter((r) => r.status === 'fail').length;
const totalDurationMs = Date.now() - startedAt;

const report = {
  generatedAt: new Date().toISOString(),
  astraKey,
  origin,
  filterId: filterId ?? null,
  summary: { total: results.length, passed, failed, totalDurationMs },
  cases: results,
};

const reportPath = resolve(process.cwd(), 'scripts/delegation-matrix-last.json');
writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log(`\n[delegation] Summary: ${passed} passed, ${failed} failed (${formatSeconds(totalDurationMs)} total)`);
console.log(`[delegation] Report: ${reportPath}`);

process.exit(failed > 0 ? 1 : 0);
