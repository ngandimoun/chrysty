-- Durable Live delegation progress and visual result replay.

alter table astra_live_delegations
  add column if not exists stage text,
  add column if not exists result jsonb,
  add column if not exists error_code text,
  add column if not exists error_stage text;

create index if not exists astra_live_delegations_active_stage_idx
  on astra_live_delegations(status, stage, updated_at desc)
  where status in ('queued', 'running');
