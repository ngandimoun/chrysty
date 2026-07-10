-- Generic daily-life scheduled capabilities and optional Web Push delivery.
create table if not exists astra_scheduled_capabilities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references astra_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  astra_key text not null,
  kind text not null check (kind in ('timer', 'reminder', 'checkpoint')),
  title text not null check (char_length(title) between 1 and 160),
  fire_at timestamptz not null,
  timezone text not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'snoozed', 'due', 'completed', 'canceled')),
  revision integer not null default 1 check (revision > 0),
  idempotency_key text not null,
  task_id text,
  session_id text,
  due_at timestamptz,
  completed_at timestamptz,
  canceled_at timestamptz,
  delivered_at timestamptz,
  audit_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create index if not exists astra_scheduled_capabilities_due_idx
  on astra_scheduled_capabilities(fire_at)
  where status in ('scheduled', 'snoozed');
create index if not exists astra_scheduled_capabilities_owner_idx
  on astra_scheduled_capabilities(user_id, updated_at desc);

drop trigger if exists astra_scheduled_capabilities_set_updated_at
  on astra_scheduled_capabilities;
create trigger astra_scheduled_capabilities_set_updated_at
  before update on astra_scheduled_capabilities
  for each row execute function public.set_updated_at();

alter table astra_scheduled_capabilities enable row level security;
create policy astra_scheduled_capabilities_owner_select
  on astra_scheduled_capabilities for select to authenticated
  using (user_id = auth.uid());
create policy astra_scheduled_capabilities_owner_insert
  on astra_scheduled_capabilities for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from astra_workspaces workspace
      where workspace.id = astra_scheduled_capabilities.workspace_id
        and workspace.user_id = auth.uid()
        and workspace.astra_key = astra_scheduled_capabilities.astra_key
    )
  );
create policy astra_scheduled_capabilities_owner_update
  on astra_scheduled_capabilities for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from astra_workspaces workspace
      where workspace.id = astra_scheduled_capabilities.workspace_id
        and workspace.user_id = auth.uid()
        and workspace.astra_key = astra_scheduled_capabilities.astra_key
    )
  );
create policy astra_scheduled_capabilities_owner_delete
  on astra_scheduled_capabilities for delete to authenticated
  using (user_id = auth.uid());

create table if not exists astra_capability_deliveries (
  id uuid primary key default gen_random_uuid(),
  capability_id uuid not null references astra_scheduled_capabilities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  revision integer not null,
  channel text not null check (channel in ('in_app', 'push', 'live')),
  state text not null default 'pending'
    check (state in ('pending', 'delivered', 'failed', 'suppressed')),
  attempt_count integer not null default 0,
  last_error text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (capability_id, revision, channel)
);
alter table astra_capability_deliveries enable row level security;
create policy astra_capability_deliveries_owner_select
  on astra_capability_deliveries for select to authenticated
  using (user_id = auth.uid());

create table if not exists astra_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  subscription jsonb not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, endpoint)
);
alter table astra_push_subscriptions enable row level security;
create policy astra_push_subscriptions_owner_all
  on astra_push_subscriptions for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
