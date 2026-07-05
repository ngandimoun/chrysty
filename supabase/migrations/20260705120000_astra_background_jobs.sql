-- Background jobs: voice-delegated long-running work (Kimi + Mastra orchestrator)

create table if not exists astra_background_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references astra_workspaces(id) on delete cascade,
  astra_key text not null,
  user_id uuid references auth.users(id) on delete set null,
  title text not null default 'Background task',
  objective text not null,
  status text not null default 'queued'
    check (status in ('queued', 'planning', 'running', 'completed', 'failed', 'canceled')),
  plan jsonb,
  working_state jsonb not null default '{}',
  progress jsonb not null default '{}',
  error text,
  result_summary text,
  document_ids text[] not null default '{}',
  origin text,
  leg_count integer not null default 0,
  heartbeat_at timestamptz,
  seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists astra_background_jobs_astra_key_created_idx
  on astra_background_jobs(astra_key, created_at desc);

create index if not exists astra_background_jobs_status_idx
  on astra_background_jobs(status);

drop trigger if exists astra_background_jobs_set_updated_at on astra_background_jobs;
create trigger astra_background_jobs_set_updated_at
  before update on astra_background_jobs
  for each row execute function public.set_updated_at();

alter table astra_background_jobs enable row level security;

create policy astra_background_jobs_user_select on astra_background_jobs
  for select to authenticated
  using (
    user_id = auth.uid()
    or workspace_id in (
      select id from astra_workspaces where user_id = auth.uid()
    )
  );

-- Group generated documents into job workspaces
alter table astra_generated_documents
  add column if not exists job_id uuid references astra_background_jobs(id) on delete set null;

create index if not exists astra_generated_documents_job_id_idx
  on astra_generated_documents(job_id);
