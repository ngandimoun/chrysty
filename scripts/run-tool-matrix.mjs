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
    console.error('Missing .env.local — set GEMINI_API_KEY before running pnpm test:tools');
    process.exit(1);
  }
}

function parseFilterArg() {
  const arg = process.argv.find((value) => value.startsWith('--id='));
  return arg ? arg.slice('--id='.length) : undefined;
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

const filterId = parseFilterArg();
const { GoogleGenAI } = await import('@google/genai');
const { getGeminiApiKey } = await import('../src/lib/gemini/config.ts');
const { getToolMatrixEntries } = await import('../src/lib/gemini/tool-test-matrix.ts');
const { runToolMatrixCaseWithRetry } = await import('../src/lib/gemini/tool-test-harness.ts');

const client = new GoogleGenAI({ apiKey: getGeminiApiKey() });
const entries = getToolMatrixEntries(filterId);

if (filterId && entries.length === 0) {
  console.error(`No tool matrix case found for id: ${filterId}`);
  process.exit(1);
}

console.log(`[tool-matrix] Running ${entries.length} case(s)${filterId ? ` (filter: ${filterId})` : ''}…\n`);

const results = [];
const startedAt = Date.now();

for (const entry of entries) {
  const result = await runToolMatrixCaseWithRetry(client, entry.case, entry.expect);
  results.push(result);

  const status = formatStatus(result.status);
  const tools = result.toolsLabel;
  const steps = result.stepTypes.join(',') || 'none';
  const custom = result.customToolCalls.join(',') || 'none';
  const charts =
    result.chartCount !== undefined
      ? `charts=${result.chartCount}${result.charts?.length ? ` [${result.charts.map((c) => `${c.kind}:${c.title.slice(0, 24)}`).join('; ')}]` : ''}`
      : '';

  if (result.status === 'skipped') {
    console.log(`[tool-matrix] ${result.id} SKIP`);
    continue;
  }

  const line = `[tool-matrix] ${result.id} ${status} ${formatSeconds(result.durationMs)} route=${formatSeconds(result.routeMs)} llm=${formatSeconds(result.llmMs)} tools=${tools} steps=${steps} custom=${custom}${charts ? ` ${charts}` : ''}`;

  if (result.status === 'fail') {
    console.log(line);
    if (result.error) console.log(`  error: ${result.error}`);
    for (const failure of result.failures) console.log(`  fail: ${failure}`);
  } else {
    console.log(line);
    if (result.spokenPreview) {
      console.log(`  spoken: ${result.spokenPreview.slice(0, 120)}`);
    }
    if (result.charts?.length) {
      for (const chart of result.charts) {
        console.log(
          `  chart: ${chart.kind} "${chart.title}" rows=${chart.dataRows} colors=${chart.colors.join(',')}`,
        );
      }
    }
    for (const warning of result.warnings) console.log(`  warn: ${warning}`);
  }
}

const passed = results.filter((r) => r.status === 'pass' || r.status === 'passWithWarning').length;
const failed = results.filter((r) => r.status === 'fail').length;
const skipped = results.filter((r) => r.status === 'skipped').length;
const totalDurationMs = Date.now() - startedAt;

const report = {
  generatedAt: new Date().toISOString(),
  filterId: filterId ?? null,
  summary: {
    total: results.length,
    passed,
    failed,
    skipped,
    totalDurationMs,
  },
  cases: results,
};

const resultsDir = resolve(process.cwd(), 'test-results');
mkdirSync(resultsDir, { recursive: true });
const reportPath = resolve(
  resultsDir,
  `tool-matrix-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
);
writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log(`\n[tool-matrix] Summary: ${passed} passed, ${failed} failed, ${skipped} skipped (${formatSeconds(totalDurationMs)} total)`);

const byCategory = new Map();
for (const result of results) {
  const list = byCategory.get(result.category) ?? [];
  list.push(result);
  byCategory.set(result.category, list);
}

console.log('[tool-matrix] By category:');
for (const [category, categoryResults] of [...byCategory.entries()].sort()) {
  const ok = categoryResults.filter((r) => r.status === 'pass' || r.status === 'passWithWarning').length;
  const warn = categoryResults.filter((r) => r.status === 'passWithWarning').length;
  console.log(`  ${category}: ${ok}/${categoryResults.length} ok${warn ? ` (${warn} with warnings)` : ''}`);
}

console.log(`[tool-matrix] Report: ${reportPath}`);

process.exit(failed > 0 ? 1 : 0);
