-- Astra worker schema for chrysty.dev (isolated from other workers)

create extension if not exists "pgcrypto";

create table if not exists astra_workspaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  platform_workspace_id uuid references worker_workspaces(id) on delete set null,
  name text not null default 'My Space',
  visitor_token text not null default ('vis_' || replace(gen_random_uuid()::text, '-', '')),
  astra_key text not null,
  settings jsonb not null default '{}',
  is_default boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists astra_workspaces_visitor_token_unique
  on astra_workspaces(visitor_token);

create unique index if not exists astra_workspaces_astra_key_unique
  on astra_workspaces(astra_key);

create index if not exists astra_workspaces_user_id_idx
  on astra_workspaces(user_id);

create unique index if not exists astra_workspaces_user_default_unique
  on astra_workspaces(user_id) where is_default = true and user_id is not null;

create table if not exists astra_companion_profiles (
  workspace_id uuid primary key references astra_workspaces(id) on delete cascade,
  astra_key text not null,
  user_id uuid references auth.users(id) on delete set null,
  preferred_name text,
  occupation text,
  food_preferences text,
  health_notes text,
  interests text,
  topics_to_avoid text,
  interaction_preferences jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists astra_companion_profiles_astra_key_idx
  on astra_companion_profiles(astra_key);

create table if not exists astra_reference_documents (
  id text primary key,
  workspace_id uuid not null references astra_workspaces(id) on delete cascade,
  astra_key text not null,
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  kind text not null check (kind in ('image', 'pdf')),
  mime_type text not null,
  size_bytes bigint not null,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create index if not exists astra_reference_documents_workspace_id_idx
  on astra_reference_documents(workspace_id);

create index if not exists astra_reference_documents_astra_key_idx
  on astra_reference_documents(astra_key);

create index if not exists astra_reference_documents_astra_key_created_idx
  on astra_reference_documents(astra_key, created_at asc);

create table if not exists astra_generated_documents (
  id text primary key,
  workspace_id uuid not null references astra_workspaces(id) on delete cascade,
  astra_key text not null,
  user_id uuid references auth.users(id) on delete set null,
  kind text not null,
  title text not null default 'Untitled',
  mime_type text,
  size_bytes bigint not null default 0,
  storage_path text,
  json_payload text,
  created_at timestamptz not null default now()
);

create index if not exists astra_generated_documents_workspace_id_idx
  on astra_generated_documents(workspace_id);

create index if not exists astra_generated_documents_astra_key_idx
  on astra_generated_documents(astra_key);

create index if not exists astra_generated_documents_astra_key_created_idx
  on astra_generated_documents(astra_key, created_at desc);

drop trigger if exists astra_workspaces_set_updated_at on astra_workspaces;
create trigger astra_workspaces_set_updated_at
  before update on astra_workspaces
  for each row execute function public.set_updated_at();

drop trigger if exists astra_companion_profiles_set_updated_at on astra_companion_profiles;
create trigger astra_companion_profiles_set_updated_at
  before update on astra_companion_profiles
  for each row execute function public.set_updated_at();
