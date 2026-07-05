import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { BENCHMARK_ASTRA_KEY } from '../src/lib/astra/constants.ts';

function loadEnvLocal() {
  for (const line of readFileSync(resolve('.env.local'), 'utf8').split('\n')) {
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

const targetSuffix = process.argv[2]?.trim() || 'da4cb84f';
const sourceKey = BENCHMARK_ASTRA_KEY;

const { createUntypedAdminClient } = await import('../src/lib/supabase/admin.ts');
const { ensureAstraWorkspace } = await import('../src/lib/astra/workspace.ts');
const { createUuid } = await import('../src/lib/ids.ts');

const admin = createUntypedAdminClient();

const { data: workspaces } = await admin.from('astra_workspaces').select('id, astra_key');
const targetWorkspace = (workspaces ?? []).find((row) => row.astra_key.endsWith(targetSuffix));

if (!targetWorkspace) {
  console.error(`No workspace found with key suffix: ${targetSuffix}`);
  process.exit(1);
}

const targetKey = targetWorkspace.astra_key;
console.log(`Copying benchmark docs → ${targetKey}`);

const { data: sourceDocs, error: sourceError } = await admin
  .from('astra_generated_documents')
  .select('*')
  .eq('astra_key', sourceKey);

if (sourceError || !sourceDocs) {
  console.error('Failed to load source docs:', sourceError?.message);
  process.exit(1);
}

const { data: existingTarget } = await admin
  .from('astra_generated_documents')
  .select('title')
  .eq('astra_key', targetKey);

const existingTitles = new Set((existingTarget ?? []).map((row) => row.title));
const toCopy = sourceDocs.filter((doc) => !existingTitles.has(doc.title));

if (toCopy.length === 0) {
  console.log('All benchmark docs already present in target workspace.');
  process.exit(0);
}

await ensureAstraWorkspace(targetKey);

let copied = 0;
for (const doc of toCopy) {
  const { error } = await admin.from('astra_generated_documents').insert({
    id: createUuid(),
    workspace_id: targetWorkspace.id,
    astra_key: targetKey,
    user_id: doc.user_id,
    kind: doc.kind,
    title: doc.title,
    mime_type: doc.mime_type,
    size_bytes: doc.size_bytes,
    storage_path: doc.storage_path,
    json_payload: doc.json_payload,
    job_id: null,
    read_at: null,
  });
  if (error) {
    console.error(`Failed to copy "${doc.title}":`, error.message);
  } else {
    copied += 1;
  }
}

console.log(`Copied ${copied}/${toCopy.length} documents to ${targetKey}`);
