import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env.local');
const migrationsDir = join(root, 'supabase', 'migrations');

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

function createPgClient(connectionString) {
  const normalized = connectionString.replace(/^postgresql:/, 'postgres:');
  const url = new URL(normalized);
  url.searchParams.delete('sslmode');

  return new pg.Client({
    connectionString: url.toString(),
    ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
  });
}

async function ensureMigrationTable(client) {
  await client.query(`
    create table if not exists astra_schema_migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    );
  `);
}

async function getAppliedMigrations(client) {
  const { rows } = await client.query('select filename from astra_schema_migrations');
  return new Set(rows.map((row) => row.filename));
}

async function tableExists(client, tableName) {
  const { rows } = await client.query(
    `
      select exists (
        select 1
        from information_schema.tables
        where table_schema = 'public'
          and table_name = $1
      ) as exists
    `,
    [tableName],
  );
  return Boolean(rows[0]?.exists);
}

async function bootstrapExistingMigrations(client, files) {
  const applied = await getAppliedMigrations(client);
  if (applied.size > 0) {
    return;
  }

  if (!(await tableExists(client, 'astra_workspaces'))) {
    return;
  }

  for (const file of files) {
    if (file === '20260703120400_astra_conversation_turns.sql') {
      if (!(await tableExists(client, 'astra_conversation_turns'))) {
        continue;
      }
    }

    await client.query(
      'insert into astra_schema_migrations (filename) values ($1) on conflict do nothing',
      [file],
    );
  }

  console.log('Bootstrapped migration history for existing Astra schema.');
}

const files = readdirSync(migrationsDir)
  .filter((name) => name.endsWith('.sql'))
  .sort();

const connectionString = loadDatabaseUrl();
const client = createPgClient(connectionString);

await client.connect();

try {
  await ensureMigrationTable(client);
  await bootstrapExistingMigrations(client, files);

  const applied = await getAppliedMigrations(client);
  let appliedCount = 0;

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`Skipping ${file} (already applied).`);
      continue;
    }

    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    console.log(`Applying ${file}...`);
    await client.query(sql);
    await client.query('insert into astra_schema_migrations (filename) values ($1)', [file]);
    console.log(`Applied ${file}`);
    appliedCount += 1;
  }

  if (appliedCount === 0) {
    console.log('No pending Astra migrations.');
  } else {
    console.log(`Astra migrations applied (${appliedCount} new).`);
  }
} finally {
  await client.end();
}
