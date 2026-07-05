#!/usr/bin/env node
/**
 * Push local dev auth redirect URLs to the linked Supabase project.
 *
 * Requires SUPABASE_ACCESS_TOKEN (from https://supabase.com/dashboard/account/tokens)
 * or: npx supabase login && pnpm auth:redirects
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const projectRef = 'uusnstujtczqjorfqgdn';
const managementBase = 'https://api.supabase.com/v1';

function loadDevHost() {
  const envPath = join(root, '.env.local');
  if (!existsSync(envPath)) return '192.168.1.70';
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^DEV_HOST=(.+)$/);
    if (match) return match[1].trim();
  }
  return '192.168.1.70';
}

function parseRedirectUrls(value) {
  if (!value || typeof value !== 'string') return [];
  return [
    ...new Set(
      value
        .split(',')
        .map((url) => url.trim().replace(/,+$/g, ''))
        .filter(Boolean),
    ),
  ];
}

function joinRedirectUrls(urls) {
  return [...new Set(urls.map((url) => url.trim()).filter(Boolean))].join(',');
}

const devHost = loadDevHost();
const redirectUrls = [
  'https://chrysty.chrysty.dev/auth/callback',
  'https://localhost:3000/auth/callback',
  'http://localhost:3000/auth/callback',
  'https://127.0.0.1:3000/auth/callback',
  `https://${devHost}:3000/auth/callback`,
];

console.log('Local auth redirect URLs to allow in Supabase:');
for (const url of redirectUrls) {
  console.log(`  - ${url}`);
}

async function updateViaManagementApi(token) {
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  const getRes = await fetch(
    `${managementBase}/projects/${encodeURIComponent(projectRef)}/config/auth`,
    { headers },
  );

  if (!getRes.ok) {
    throw new Error(`GET auth config failed (${getRes.status}): ${await getRes.text()}`);
  }

  const current = await getRes.json();
  const existing = parseRedirectUrls(current.uri_allow_list);
  const merged = joinRedirectUrls([...existing, ...redirectUrls]);
  const added = redirectUrls.filter((url) => !existing.includes(url));

  if (added.length === 0) {
    console.log('\nAll redirect URLs already present in Supabase.');
    return;
  }

  const patchRes = await fetch(
    `${managementBase}/projects/${encodeURIComponent(projectRef)}/config/auth`,
    {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ uri_allow_list: merged }),
    },
  );

  if (!patchRes.ok) {
    throw new Error(`PATCH auth config failed (${patchRes.status}): ${await patchRes.text()}`);
  }

  console.log('\nAdded redirect URLs:');
  for (const url of added) {
    console.log(`  + ${url}`);
  }
  console.log('\nAuth redirect URLs updated on Supabase.');
}

async function main() {
  const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();

  if (token) {
    try {
      await updateViaManagementApi(token);
      return;
    } catch (error) {
      console.error('\nManagement API update failed:', error instanceof Error ? error.message : error);
      process.exitCode = 1;
      return;
    }
  }

  console.log('\nNo SUPABASE_ACCESS_TOKEN — trying supabase config push…');

  try {
    execSync(`npx supabase config push --project-ref ${projectRef}`, {
      cwd: root,
      stdio: 'inherit',
      shell: true,
    });
    console.log('\nAuth redirect URLs updated on Supabase.');
  } catch {
    console.error('\nCLI push failed. Set SUPABASE_ACCESS_TOKEN or run: npx supabase login && pnpm auth:redirects');
    process.exitCode = 1;
  }
}

main();
