-- Allow Astra conversation continuity for anonymous ak_* workspaces.

alter table astra_conversation_turns
  alter column user_id drop not null;

create index if not exists astra_conversation_turns_astra_key_created_idx
  on astra_conversation_turns(astra_key, created_at desc);

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
