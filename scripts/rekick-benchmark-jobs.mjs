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

const origin = 'https://localhost:3000';
const { getBackgroundJob } = await import('../src/lib/background-jobs/db.ts');
const { kickoffJobLeg } = await import('../src/lib/background-jobs/kickoff.ts');

const report = JSON.parse(readFileSync(resolve('scripts/background-job-matrix-last.json'), 'utf8'));

for (const entry of report.cases) {
  if (!entry.jobId || entry.status === 'pass') continue;
  const job = await getBackgroundJob(entry.jobId);
  if (!job || job.status === 'completed' || job.status === 'failed') continue;
  console.log(`Re-kicking ${entry.id} (${job.status}, leg ${job.leg_count}) …`);
  await kickoffJobLeg(job.id, origin);
}

console.log('Done. Poll with: pnpm tsx scripts/validate-background-job-report.mjs');
