alter table astra_companion_profiles
  add column if not exists interaction_preferences jsonb;
