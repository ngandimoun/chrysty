# Chrysty Astra baseline — 2026-07-11 (pre-embed)

Rollback reference before Ask Chrysty Live embed work. Standalone Astra Live must keep passing these gates after embed ships.

## Frozen files (embed must not edit)

- `src/hooks/use-gemini-live.ts`
- `src/components/astra/astra-voice-shell.tsx`
- `src/lib/gemini/chrysty-ecosystem.ts`
- `src/lib/gemini/response-prompt.ts`
- `src/lib/live/workspace-context.ts`
- `src/lib/live/session-context.ts`
- All existing `src/app/api/live/*` routes

## Additive embed surface only

- `packages/live-embed/`
- `src/app/embed/**`
- `src/components/embed/**`
- `src/lib/embed/**`
- `src/app/api/embed/**`
- `docs/embed/**`

## Verified gates (re-run after embed)

- `pnpm exec tsc --noEmit`
- Standalone Live connect / speak / hear on `chrysty.chrysty.dev`
- `/embed/live` side-by-side with standalone Live (device gate)
- `PATCH /api/astra/ui-context` unchanged
- Documents sheet + background jobs unchanged

## Rollback

Revert commits touching frozen files. Disable embed via removing `@chrysty/live-embed` from sibling apps. `/embed/live` is isolated — prod `/` unaffected.

See also: [live-baseline-2026-07-10.md](./live-baseline-2026-07-10.md)
