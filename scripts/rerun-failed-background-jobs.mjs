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
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const reportPath = resolve('scripts/background-job-matrix-last.json');
let failedIds = ['research-comparison-table', 'chart-market-trends', 'math-physics-projectile', 'study-kit-multi', 'budget-spreadsheet-style', 'visual-travel-guide'];

try {
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const fromReport = report.cases.filter((c) => c.status !== 'pass').map((c) => c.id);
  if (fromReport.length > 0) failedIds = fromReport;
} catch {
  // use defaults
}

console.log('[rerun-failed] Will rerun:', failedIds.join(', '));

for (const id of failedIds) {
  console.log(`\n[rerun-failed] === ${id} ===`);
  const { spawnSync } = await import('node:child_process');
  const result = spawnSync('pnpm', ['test:background-jobs', '--', `--id=${id}`], {
    stdio: 'inherit',
    shell: true,
    cwd: process.cwd(),
  });
  if (result.status !== 0) {
    console.error(`[rerun-failed] ${id} exited ${result.status}`);
  }
}

console.log('\n[rerun-failed] Finished. Run: pnpm tsx scripts/validate-background-job-report.mjs');
