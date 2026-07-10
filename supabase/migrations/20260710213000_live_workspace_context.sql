-- Bounded active UI context and conflict-safe generated-document mutations.
alter table astra_live_sessions
  add column if not exists ui_context jsonb;

alter table astra_generated_documents
  add column if not exists revision integer not null default 1,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists last_mutation jsonb;

create table if not exists astra_generated_document_mutations (
  id uuid primary key default gen_random_uuid(),
  document_id text not null references astra_generated_documents(id) on delete cascade,
  workspace_id uuid not null references astra_workspaces(id) on delete cascade,
  astra_key text not null,
  user_id uuid references auth.users(id) on delete set null,
  session_id text,
  action text not null check (action in ('update', 'append', 'rename')),
  from_revision integer not null,
  to_revision integer not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists astra_generated_document_mutations_document_idx
  on astra_generated_document_mutations(document_id, created_at desc);

alter table astra_generated_document_mutations enable row level security;

create or replace function mutate_astra_generated_document(
  p_astra_key text,
  p_document_id text,
  p_expected_revision integer,
  p_action text,
  p_title text,
  p_json_payload text,
  p_user_id uuid,
  p_session_id text,
  p_metadata jsonb default '{}'::jsonb
)
returns setof astra_generated_documents
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row astra_generated_documents%rowtype;
  next_revision integer;
  audit jsonb;
begin
  if p_action not in ('update', 'append', 'rename') then
    raise exception 'invalid_document_action';
  end if;

  select * into current_row
  from astra_generated_documents
  where id = p_document_id and astra_key = p_astra_key
  for update;

  if not found then
    raise exception 'document_not_found';
  end if;
  if current_row.revision <> p_expected_revision then
    raise exception 'revision_conflict';
  end if;

  next_revision := current_row.revision + 1;
  audit := coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
    'action', p_action,
    'session_id', p_session_id,
    'from_revision', current_row.revision,
    'to_revision', next_revision,
    'at', now()
  );

  update astra_generated_documents
  set title = coalesce(p_title, title),
      json_payload = coalesce(p_json_payload, json_payload),
      revision = next_revision,
      updated_at = now(),
      last_mutation = audit
  where id = p_document_id and astra_key = p_astra_key
  returning * into current_row;

  insert into astra_generated_document_mutations (
    document_id, workspace_id, astra_key, user_id, session_id, action,
    from_revision, to_revision, metadata
  ) values (
    current_row.id, current_row.workspace_id, current_row.astra_key,
    p_user_id, p_session_id, p_action, p_expected_revision,
    next_revision, audit
  );

  return next current_row;
end;
$$;

revoke all on function mutate_astra_generated_document(
  text, text, integer, text, text, text, uuid, text, jsonb
) from public;
grant execute on function mutate_astra_generated_document(
  text, text, integer, text, text, text, uuid, text, jsonb
) to service_role;
