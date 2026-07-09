-- Live session continuity + delegation jobs for Gemini Live integration

create table if not exists astra_live_sessions (
  session_id text primary key,
  workspace_id uuid references astra_workspaces(id) on delete cascade,
  astra_key text not null,
  mode text not null default 'default',
  live_guide_state jsonb,
  resumption_handle text,
  pending_turn_id text,
  updated_at timestamptz not null default now()
);

create index if not exists astra_live_sessions_astra_key_idx
  on astra_live_sessions(astra_key, updated_at desc);

create table if not exists astra_live_delegations (
  turn_id text primary key,
  session_id text not null,
  workspace_id uuid not null references astra_workspaces(id) on delete cascade,
  astra_key text not null,
  user_id uuid references auth.users(id) on delete set null,
  status text not null default 'queued',
  request jsonb not null,
  spoken_summary text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists astra_live_delegations_session_idx
  on astra_live_delegations(session_id, created_at desc);

create index if not exists astra_live_delegations_astra_key_idx
  on astra_live_delegations(astra_key, created_at desc);

alter table astra_live_sessions enable row level security;
alter table astra_live_delegations enable row level security;
