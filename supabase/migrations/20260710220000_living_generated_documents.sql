-- Living generated documents: stable provenance keys, compatibility timestamps,
-- revision audit metadata, and atomic confirmed merges.
alter table astra_generated_documents
  add column if not exists source_key text,
  add column if not exists source_metadata jsonb not null default '{}'::jsonb,
  add column if not exists audit_metadata jsonb not null default '{}'::jsonb;

-- Rows predating document revisions should sort by their real creation time,
-- rather than by the time the compatibility column was installed.
update astra_generated_documents
set updated_at = created_at
where revision = 1
  and last_mutation is null
  and updated_at > created_at;

update astra_generated_documents
set audit_metadata = coalesce(last_mutation, '{}'::jsonb)
where audit_metadata = '{}'::jsonb
  and last_mutation is not null;

create unique index if not exists astra_generated_documents_source_key_idx
  on astra_generated_documents(astra_key, source_key)
  where source_key is not null;

alter table astra_generated_document_mutations
  drop constraint if exists astra_generated_document_mutations_action_check;
alter table astra_generated_document_mutations
  add constraint astra_generated_document_mutations_action_check
  check (action in ('update', 'append', 'rename', 'merge'));

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
  if not found then raise exception 'document_not_found'; end if;
  if current_row.revision <> p_expected_revision then raise exception 'revision_conflict'; end if;

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
      last_mutation = audit,
      audit_metadata = coalesce(audit_metadata, '{}'::jsonb)
        || jsonb_build_object('last_mutation', audit)
  where id = p_document_id and astra_key = p_astra_key
  returning * into current_row;

  insert into astra_generated_document_mutations (
    document_id, workspace_id, astra_key, user_id, session_id, action,
    from_revision, to_revision, metadata
  ) values (
    current_row.id, current_row.workspace_id, current_row.astra_key,
    p_user_id, p_session_id, p_action, p_expected_revision, next_revision, audit
  );
  return next current_row;
end;
$$;

create or replace function merge_astra_generated_documents(
  p_astra_key text,
  p_target_id text,
  p_source_ids text[],
  p_expected_revisions jsonb,
  p_title text,
  p_json_payload text,
  p_user_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns setof astra_generated_documents
language plpgsql
security definer
set search_path = public
as $$
declare
  target_row astra_generated_documents%rowtype;
  source_row astra_generated_documents%rowtype;
  next_revision integer;
  audit jsonb;
  merged_sources jsonb := '[]'::jsonb;
begin
  if coalesce(array_length(p_source_ids, 1), 0) < 1
     or p_target_id = any(p_source_ids) then
    raise exception 'invalid_merge_request';
  end if;

  select * into target_row
  from astra_generated_documents
  where id = p_target_id and astra_key = p_astra_key
  for update;

  if not found then raise exception 'document_not_found'; end if;
  if target_row.kind <> 'text' then raise exception 'unsupported_document'; end if;
  if target_row.revision <> coalesce((p_expected_revisions ->> p_target_id)::integer, 0) then
    raise exception 'revision_conflict';
  end if;

  for source_row in
    select *
    from astra_generated_documents
    where id = any(p_source_ids) and astra_key = p_astra_key
    order by id
    for update
  loop
    if source_row.kind <> 'text' then raise exception 'unsupported_document'; end if;
    if source_row.revision <> coalesce((p_expected_revisions ->> source_row.id)::integer, 0) then
      raise exception 'revision_conflict';
    end if;
    merged_sources := merged_sources || jsonb_build_array(jsonb_build_object(
      'id', source_row.id,
      'title', source_row.title,
      'revision', source_row.revision,
      'source_key', source_row.source_key,
      'source_metadata', source_row.source_metadata
    ));
  end loop;

  if jsonb_array_length(merged_sources) <> array_length(p_source_ids, 1) then
    raise exception 'document_not_found';
  end if;

  next_revision := target_row.revision + 1;
  audit := coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
    'action', 'merge',
    'from_revision', target_row.revision,
    'to_revision', next_revision,
    'merged_sources', merged_sources,
    'at', now()
  );

  update astra_generated_documents
  set title = coalesce(nullif(trim(p_title), ''), title),
      json_payload = p_json_payload,
      revision = next_revision,
      updated_at = now(),
      last_mutation = audit,
      audit_metadata = coalesce(audit_metadata, '{}'::jsonb) || jsonb_build_object(
        'last_mutation', audit,
        'merged_sources', merged_sources
      )
  where id = p_target_id and astra_key = p_astra_key
  returning * into target_row;

  insert into astra_generated_document_mutations (
    document_id, workspace_id, astra_key, user_id, session_id, action,
    from_revision, to_revision, metadata
  ) values (
    target_row.id, target_row.workspace_id, target_row.astra_key, p_user_id,
    'documents-ui', 'merge', next_revision - 1, next_revision, audit
  );

  delete from astra_generated_documents
  where astra_key = p_astra_key and id = any(p_source_ids);

  return next target_row;
end;
$$;

revoke all on function merge_astra_generated_documents(
  text, text, text[], jsonb, text, text, uuid, jsonb
) from public;
grant execute on function merge_astra_generated_documents(
  text, text, text[], jsonb, text, text, uuid, jsonb
) to service_role;
