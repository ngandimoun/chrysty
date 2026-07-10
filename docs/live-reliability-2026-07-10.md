# Chrysty Live reliability checkpoint — 2026-07-10

This checkpoint preserves the deployed multimodal reliability work before contextual daily-assistance changes.

## Coordinated source

- Astra commit: `e864f87`
- Voice service commit: `21e4961`
- Coordinated tag: `live-reliability-2026-07-10`
- Original rollback tag remains immutable: `live-baseline-2026-07-10`

## Production

- Vercel deployment: `dpl_2BRPMyebw4ShesYCuerLxfnvZLZM`
- Cloud Run revision: `chrysty-voice-00012-nt5`
- Supabase migration: `20260710121000_live_delegation_results.sql`
- Live model: `gemini-3.1-flash-live-preview`
- Backend: Gemini API

## Verified behavior

- Exact deliberate camera captures remain visible and attach to delegation.
- Periodic camera frames do not consume pending captures.
- Delegation progress and complete visual results survive reconnect/replay.
- Dynamic tool and response-surface routing is active.
- Chart hydration and Live stream replay tests pass.
- Production protocol smoke returned model audio and output transcription.

## Protected invariants

- Browser microphone: mono PCM16, 16 kHz, 640-byte chunks.
- Model playback: mono PCM16, 24 kHz, AudioWorklet ring buffer.
- No unsolicited startup audio.
- Input/output transcriptions reach the browser.
- Interruption clears queued playback.

## Rollback

Restore both repositories at `live-reliability-2026-07-10`, redeploy Astra, and route Cloud Run traffic to `chrysty-voice-00012-nt5`.

For the earlier audio-only repair baseline, use `live-baseline-2026-07-10` and the deployment references in `docs/live-baseline-2026-07-10.md`.
