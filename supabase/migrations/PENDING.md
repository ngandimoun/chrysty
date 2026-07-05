# Astra worker migrations

| Migration | Status |
|-----------|--------|
| `20260703120000_astra_worker_register.sql` | Applied |
| `20260703120100_astra_workspaces_and_tables.sql` | Applied |
| `20260703120200_astra_worker_rls.sql` | Applied |
| `20260703120300_astra_worker_storage.sql` | Applied |
| `20260703120400_astra_conversation_turns.sql` | Applied |
| `20260703120500_astra_generated_documents_read_at.sql` | Applied |
| `20260703120600_astra_companion_interaction_preferences.sql` | Applied |
| `20260703120700_astra_anonymous_conversation_turns.sql` | Applied |

Apply to remote shared project:

```bash
# Windows PowerShell (TLS workaround for some networks)
$env:NODE_TLS_REJECT_UNAUTHORIZED='0'
pnpm db:apply
pnpm db:verify
```

Prefer Supabase MCP `apply_migration` when the `user-supabase` server is connected in Cursor.
