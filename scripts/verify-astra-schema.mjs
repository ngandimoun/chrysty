import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env.local');

function loadDatabaseUrl() {
  const raw = readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^DATABASE_URL=(.*)$/);
    if (!match) continue;
    let value = match[1].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    return value;
  }
  throw new Error('DATABASE_URL not found in .env.local');
}

const connectionString = loadDatabaseUrl();
const client = new pg.Client({
  connectionString,
  ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
});

await client.connect();

try {
  const tables = await client.query(`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_name like 'astra_%'
    order by table_name
  `);

  const worker = await client.query(`
    select slug, name, status from public.workers where slug = 'astra'
  `);

  const bucket = await client.query(`
    select id, name from storage.buckets where id = 'astra-uploads'
  `);

  console.log('astra tables:', tables.rows.map((row) => row.table_name).join(', ') || '(none)');
  console.log('worker row:', worker.rows[0] ?? '(missing)');
  console.log('storage bucket:', bucket.rows[0] ?? '(missing)');
} finally {
  await client.end();
}
