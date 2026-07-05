-- RLS on astra worker tables (service role bypasses; blocks direct anon PostgREST access)

alter table astra_workspaces enable row level security;
alter table astra_companion_profiles enable row level security;
alter table astra_reference_documents enable row level security;
alter table astra_generated_documents enable row level security;

create policy astra_workspaces_user_select on astra_workspaces
  for select to authenticated
  using (user_id = auth.uid());

create policy astra_workspaces_user_update on astra_workspaces
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy astra_workspaces_user_insert on astra_workspaces
  for insert to authenticated
  with check (user_id = auth.uid());

create policy astra_companion_profiles_user_select on astra_companion_profiles
  for select to authenticated
  using (
    user_id = auth.uid()
    or workspace_id in (
      select id from astra_workspaces where user_id = auth.uid()
    )
  );

create policy astra_companion_profiles_user_insert on astra_companion_profiles
  for insert to authenticated
  with check (
    user_id = auth.uid()
    or workspace_id in (
      select id from astra_workspaces where user_id = auth.uid()
    )
  );

create policy astra_companion_profiles_user_update on astra_companion_profiles
  for update to authenticated
  using (
    user_id = auth.uid()
    or workspace_id in (
      select id from astra_workspaces where user_id = auth.uid()
    )
  );

create policy astra_companion_profiles_user_delete on astra_companion_profiles
  for delete to authenticated
  using (
    user_id = auth.uid()
    or workspace_id in (
      select id from astra_workspaces where user_id = auth.uid()
    )
  );

create policy astra_reference_documents_user_select on astra_reference_documents
  for select to authenticated
  using (
    user_id = auth.uid()
    or workspace_id in (
      select id from astra_workspaces where user_id = auth.uid()
    )
  );

create policy astra_reference_documents_user_insert on astra_reference_documents
  for insert to authenticated
  with check (
    user_id = auth.uid()
    or workspace_id in (
      select id from astra_workspaces where user_id = auth.uid()
    )
  );

create policy astra_reference_documents_user_update on astra_reference_documents
  for update to authenticated
  using (
    user_id = auth.uid()
    or workspace_id in (
      select id from astra_workspaces where user_id = auth.uid()
    )
  );

create policy astra_reference_documents_user_delete on astra_reference_documents
  for delete to authenticated
  using (
    user_id = auth.uid()
    or workspace_id in (
      select id from astra_workspaces where user_id = auth.uid()
    )
  );

create policy astra_generated_documents_user_select on astra_generated_documents
  for select to authenticated
  using (
    user_id = auth.uid()
    or workspace_id in (
      select id from astra_workspaces where user_id = auth.uid()
    )
  );

create policy astra_generated_documents_user_insert on astra_generated_documents
  for insert to authenticated
  with check (
    user_id = auth.uid()
    or workspace_id in (
      select id from astra_workspaces where user_id = auth.uid()
    )
  );

create policy astra_generated_documents_user_update on astra_generated_documents
  for update to authenticated
  using (
    user_id = auth.uid()
    or workspace_id in (
      select id from astra_workspaces where user_id = auth.uid()
    )
  );

create policy astra_generated_documents_user_delete on astra_generated_documents
  for delete to authenticated
  using (
    user_id = auth.uid()
    or workspace_id in (
      select id from astra_workspaces where user_id = auth.uid()
    )
  );
