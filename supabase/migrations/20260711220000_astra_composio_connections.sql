-- Composio Tool Router session + connected toolkit accounts (per authenticated user).

create table if not exists astra_composio_sessions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  session_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists astra_composio_sessions_set_updated_at on astra_composio_sessions;
create trigger astra_composio_sessions_set_updated_at
  before update on astra_composio_sessions
  for each row execute function public.set_updated_at();

alter table astra_composio_sessions enable row level security;

create policy astra_composio_sessions_owner_select
  on astra_composio_sessions for select to authenticated
  using (user_id = auth.uid());

create policy astra_composio_sessions_owner_insert
  on astra_composio_sessions for insert to authenticated
  with check (user_id = auth.uid());

create policy astra_composio_sessions_owner_update
  on astra_composio_sessions for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy astra_composio_sessions_owner_delete
  on astra_composio_sessions for delete to authenticated
  using (user_id = auth.uid());

create table if not exists astra_composio_connections (
  user_id uuid not null references auth.users(id) on delete cascade,
  toolkit_slug text not null,
  toolkit_name text,
  logo_url text,
  connected_account_id text not null,
  session_id text,
  status text not null default 'active'
    check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, toolkit_slug)
);

create index if not exists astra_composio_connections_owner_idx
  on astra_composio_connections(user_id, status, updated_at desc);

drop trigger if exists astra_composio_connections_set_updated_at on astra_composio_connections;
create trigger astra_composio_connections_set_updated_at
  before update on astra_composio_connections
  for each row execute function public.set_updated_at();

alter table astra_composio_connections enable row level security;

create policy astra_composio_connections_owner_select
  on astra_composio_connections for select to authenticated
  using (user_id = auth.uid());

create policy astra_composio_connections_owner_insert
  on astra_composio_connections for insert to authenticated
  with check (user_id = auth.uid());

create policy astra_composio_connections_owner_update
  on astra_composio_connections for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy astra_composio_connections_owner_delete
  on astra_composio_connections for delete to authenticated
  using (user_id = auth.uid());
