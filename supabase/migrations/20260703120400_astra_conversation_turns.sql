-- Conversation turn history for logged-in Astra users (backend-only; no UI)

create table if not exists astra_conversation_turns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references astra_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  astra_key text not null,
  user_transcript text not null,
  assistant_spoken text,
  has_images boolean not null default false,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists astra_conversation_turns_user_created_idx
  on astra_conversation_turns(user_id, created_at desc);

create index if not exists astra_conversation_turns_workspace_created_idx
  on astra_conversation_turns(workspace_id, created_at desc);

alter table astra_conversation_turns enable row level security;

drop policy if exists astra_conversation_turns_user_select on astra_conversation_turns;
create policy astra_conversation_turns_user_select on astra_conversation_turns
  for select to authenticated
  using (
    user_id = auth.uid()
    or workspace_id in (
      select id from astra_workspaces where user_id = auth.uid()
    )
  );

drop policy if exists astra_conversation_turns_user_insert on astra_conversation_turns;
create policy astra_conversation_turns_user_insert on astra_conversation_turns
  for insert to authenticated
  with check (
    user_id = auth.uid()
    or workspace_id in (
      select id from astra_workspaces where user_id = auth.uid()
    )
  );

drop policy if exists astra_conversation_turns_user_delete on astra_conversation_turns;
create policy astra_conversation_turns_user_delete on astra_conversation_turns
  for delete to authenticated
  using (
    user_id = auth.uid()
    or workspace_id in (
      select id from astra_workspaces where user_id = auth.uid()
    )
  );
