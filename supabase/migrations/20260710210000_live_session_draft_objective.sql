-- Compact conversational objective continuity for Gemini Live sessions.
alter table astra_live_sessions
  add column if not exists draft_objective jsonb;
