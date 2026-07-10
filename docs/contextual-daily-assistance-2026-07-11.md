# Contextual daily assistance rollout — 2026-07-11

## Coordinated source

- Astra branch: `contextual-daily-assistance`
- Astra feature commit: `09f164a`
- Astra verification fix: `86d3cb0`
- Voice branch: `contextual-daily-assistance`
- Voice commit: `5ed7238`

## Production rollout

- Supabase migrations:
  - `20260710210000_live_session_draft_objective.sql`
  - `20260710213000_live_workspace_context.sql`
  - `20260710220000_living_generated_documents.sql`
  - `20260710223000_language_personalization.sql`
  - `20260710230000_scheduled_capabilities.sql`
- Vercel deployment: `dpl_J9jfQoPBgC8W2NznfrgDRKcJqGrX`
- Production alias: `https://chrysty.vercel.app`
- Cloud Run revision: `chrysty-voice-00013-sml`
- Cloud Run service URL: `https://chrysty-voice-svtrmafyea-uc.a.run.app`

## Verification

- Astra TypeScript, production build, focused lint, and contextual contract tests passed.
- Voice pytest, Ruff, Python compilation, and all 12 Live tool schemas passed.
- Protected PCM capture/player and audio protocol files are unchanged from `live-reliability-2026-07-10`.
- Authenticated Astra health returned `{"ok":true}`.
- Production Live protocol smoke returned 74,402 audio bytes and the expected output transcription.
- Vercel reported no runtime errors after deployment.

## Known external checks

- One URL tool matrix case is blocked by Gemini safety policy.
- One Maps-plus-custom tool matrix case timed out; local routing and schema contracts pass.
- Existing generated matrix evidence was intentionally not committed or overwritten.

## Rollback

1. Restore Astra and voice from `live-reliability-2026-07-10`.
2. Redeploy Astra from commit `748caa0`.
3. Route Cloud Run traffic back to `chrysty-voice-00012-nt5`.
4. Leave additive database columns/tables in place; older code ignores them.
