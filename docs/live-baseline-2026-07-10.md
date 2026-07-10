# Chrysty Live baseline — 2026-07-10

This is the rollback reference for the repaired Live voice path before multimodal reliability work.

## Coordinated source

- Astra commit: `6dbd816` (`ngandimoun/chrysty`)
- Voice service commit: `3723843` (`ngandimoun/chrysty-voice`)
- Annotated tag in both repositories: `live-baseline-2026-07-10`

## Deployed reference

- Vercel deployment: `dpl_CEcpDkaqVmBE9Hio8AHhab6MKLjg`
- Cloud Run revision: `chrysty-voice-00011-4kd`
- Cloud Run image digest: `sha256:087ca3e…058d6`
- Live model: `gemini-3.1-flash-live-preview`
- Backend mode at capture time: Gemini API (`GOOGLE_GENAI_USE_VERTEXAI=FALSE`)

## Verified gates

- Astra TypeScript: `pnpm exec tsc --noEmit`
- Camera zoom model: `pnpm run test:zoom-model`
- Voice protocol: `uv run pytest tests/test_live_protocol.py -q` (3 passed)
- Changed voice files: Ruff clean
- Both repositories: `git diff --check`
- Production protocol evidence: connected without startup speech, 63,390 outbound audio bytes, final output transcript “Live audio check.”

## Expected invariants

- Browser sends mono PCM16 at 16 kHz in 640-byte chunks.
- Model audio is mono PCM16 at 24 kHz through the Live worklet ring buffer.
- A connection does not synthesize unsolicited startup audio.
- Input and output transcriptions reach the browser.
- Interruption clears queued playback.
- Browser disconnect cancels the peer Live task.
- Concurrent tool calls resolve session state through `ToolContext`.

## Rollback

Source rollback is the coordinated tag in both repositories:

```powershell
git switch --detach live-baseline-2026-07-10
```

For production, restore Vercel deployment `dpl_CEcpDkaqVmBE9Hio8AHhab6MKLjg` and route Cloud Run traffic to `chrysty-voice-00011-4kd`.

After rollback, repeat the protocol smoke and a physical microphone test before accepting traffic.
