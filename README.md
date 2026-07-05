# Chrysty

Voice-first PWA with Gemini voice understanding, optional camera vision, mobile audio hardening, and PWA installability.

## Stack

- **Next.js 16** (App Router, TypeScript, Turbopack)
- **shadcn/ui** + LiveKit **Agents UI** (`AgentAudioVisualizerAura`)
- **Framer Motion** for status transitions
- **Serwist** PWA (offline app shell)
- **livekit-client** for local mic track visualization only (no LiveKit AI agent)

## Getting started

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). Microphone access requires **HTTPS** when testing from another device on your network (e.g. iPad). Vercel provides HTTPS automatically in production.

### Test on iPad (same Wi‑Fi)

Safari blocks the microphone on `http://YOUR-PC-IP:3000`. Use local HTTPS instead:

1. Install [mkcert](https://github.com/FiloSottile/mkcert#installation) on your PC
2. Optional: set `DEV_HOST` in `.env.local` if your LAN IP is not `192.168.1.69`
3. Generate dev certificates:

```bash
pnpm certs:install
```

4. Start HTTPS dev server:

```bash
pnpm dev:https
```

5. On iPad Safari, open **`https://<your-pc-ip>:3000`** (note **https**, not http)
6. If Safari warns about the certificate, install the mkcert root CA on iPad (one-time): [mkcert mobile devices](https://github.com/FiloSottile/mkcert#mobile-devices)

### Production build

```bash
pnpm build
pnpm start
```

## Deploy on Vercel (Pro)

**Production:** https://chrysty.chrysty.dev  
**Worker slug:** `chrysty`  
**Platform API:** https://api.chrysty.dev

1. Copy `.env.example` values to Vercel project environment variables.
2. Set `NEXT_PUBLIC_APP_URL=https://chrysty.chrysty.dev` and `APP_URL=https://chrysty.chrysty.dev`.
3. In Supabase Auth → URL Configuration, allow `https://chrysty.chrysty.dev/auth/callback` (or keep the shared `https://*.chrysty.dev/**` wildcard).
4. Use the Supabase **transaction pooler** for `DATABASE_URL` (port `6543`, append `?pgbouncer=true`).
5. Background jobs use `maxDuration = 300` on Vercel Pro — set `GENERATION_INTERNAL_SECRET` and `MOONSHOT_API_KEY`.
6. Deploy with `pnpm build` (Vercel runs this automatically).

Required env vars on Vercel:

- `NEXT_PUBLIC_APP_URL`, `APP_URL`, `NEXT_PUBLIC_WORKER_SLUG=chrysty`
- `CHRYSTY_API_URL`, `NEXT_PUBLIC_CHRYSTY_API_URL`
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_UPLOADS_BUCKET=astra-uploads`
- `GEMINI_API_KEY`
- `DATABASE_URL` (migrations + background jobs)
- `MOONSHOT_API_KEY`, `GENERATION_INTERNAL_SECRET` (background jobs)
- `MEM0_API_KEY` (optional companion memory)

Auth uses hub SSO at `https://www.chrysty.dev` — same flow as sibling workers (Ledger, Learning, etc.). Production cookies are scoped to `.chrysty.dev`.

Do **not** set `DEV_HOST`, `NEXT_PUBLIC_ASTRA_PERSONAL_KEY`, or localhost URLs in production.

## UI controls

- **Connect** — requests mic permission and starts the Aura visualizer with your local audio
- **Camera** — opens live preview (rear camera by default); tap again to close
- **In-preview controls** — when the camera is open, **flip**, **torch** (Android rear), and **capture shutter** appear on the preview; take up to 7 stills (thumbnails below)
- **Record** / **Stop & send** — tap to start/stop recording; sends audio + captured photos, or a smart snapshot when camera is on with no captures
- **End** — stops mic and camera tracks, clears all captured photos, and resets the session

See [docs/camera-vision.md](docs/camera-vision.md) for architecture, API contract, and device notes.

## Environment variables

| Variable | Required | Default |
|----------|----------|---------|
| `GEMINI_API_KEY` | Yes (server) | — |
| `GEMINI_RESPONSE_MODEL` | No | `gemini-3.5-flash` (code default); `.env.example` uses `gemini-3.1-flash-lite` |
| `GEMINI_TEACHER_FALLBACK_MODELS` | No | `gemini-3.1-flash-lite,gemini-3.1-pro-preview` — tried in order when the primary response model fails or times out |
| `GEMINI_TTS_MODEL` | No | `gemini-3.1-flash-tts-preview` |
| `GEMINI_TTS_VOICE` | No | `Aoede` |
| `GEMINI_ENABLE_GOOGLE_SEARCH` | No | `true` — enables automatic Google Search grounding on the response model |
| `GEMINI_ENABLE_GOOGLE_MAPS` | No | `true` — enables Google Maps grounding with place cards in the explanation canvas |
| `GEMINI_ENABLE_URL_CONTEXT` | No | `true` — enables URL context for deep-reading web pages (spoken URLs, camera URLs, or Search-discovered pages) |
| `GEMINI_ENABLE_CUSTOM_TOOLS` | No | `true` — enables custom function tools (`calculator`, `processDate`, `convert`, `randomChoice`, `getUserContext`, optional `getWeather`) |
| `GEMINI_ENABLE_CODE_EXECUTION` | No | `true` — enables Python code execution for math, data analysis, and receipt/image calculations with Recharts charts in the explanation canvas |
| `OPENWEATHER_API_KEY` | No | — when set, registers the `getWeather` custom tool (OpenWeatherMap) |
| `NEXT_PUBLIC_PERCEPTION_ENABLED` | No | `true` — enables lazy browser perception after camera use |
| `NEXT_PUBLIC_DEBUG_PERCEPTION` | No | `false` — logs detector/profile timing diagnostics without raw frames |
| `NEXT_PUBLIC_PERCEPTION_MODEL_BASE_URL` | No | — optional base URL for versioned perception model assets |
| `MEM0_API_KEY` | No | — when set, enables long-term companion memory (Mem0 Platform) for Supabase and anonymous Astra sessions |
| `MEM0_AGENT_ID` | No | `chrysty-astra` |
| `MEM0_SEARCH_TOP_K` | No | `8` |
| `MEM0_SEARCH_THRESHOLD` | No | `0.3` |
| `ASTRA_RECENT_TURNS_LIMIT` | No | `6` — recent Supabase turns injected for same-session continuity |
| `DATABASE_URL` | No | — used by `pnpm db:apply` and `pnpm db:verify` for Supabase schema migrations |

### Companion memory (Mem0 + Supabase)

For any Astra session with a valid `ak_*` key, each voice turn:

1. **Retrieves** Mem0 semantic memories (auto-extracted from past conversations) and recent turns from `astra_conversation_turns`
2. **Injects** both into the Gemini system prompt — no UI, no "remember this" commands required
3. **Persists** the turn to Supabase and sends the exchange to Mem0 for fact extraction before the stream completes

Logged-in users are keyed by Supabase user ID. Anonymous sessions are keyed by their local `ak_*` Astra key, so they keep continuity on the same browser/device. Apply migrations with `pnpm db:apply` before using conversation history storage.

Test offline prompt blocks + optional live Mem0 API:

```bash
pnpm test:mem0
```

Requires `MEM0_API_KEY` in `.env.local` for the live round-trip.

For Cursor development, Mem0 MCP is configured in [`.cursor/mcp.json`](.cursor/mcp.json).


Chrysty runs a **transcribe-first** voice pipeline: STT → tool router → text+images response with only the selected tools. This avoids a Gemini API limitation where audio and `code_execution` cannot share one interaction.

| Tool | Use for |
|------|---------|
| Google Search | Live facts, news, discovery |
| URL context | Deep read of specific pages |
| Google Maps | Places, directions, local recommendations |
| Code execution | Complex math, receipts, charts, multi-step data |
| Custom tools | Simple math (`calculator`), dates (`processDate`), units/currency (`convert`), random picks (`randomChoice`), device context, weather |

Billing: Search/Maps billed per query executed. URL content counts as `tool_use_input_tokens`. Built-in tool steps count toward prompt tokens on continuation turns. Search is not double-charged at the token level. Code execution uses normal input/output tokens. STT + router add ~1–2s latency per voice turn.

Set any `GEMINI_ENABLE_*=false` flag to disable that tool and reduce latency/cost.

## Tool matrix tests (live API)

Run the full native + custom tool matrix against the real Gemini API (same path as voice after STT):

```bash
pnpm test:tools
```

- Requires `.env.local` with `GEMINI_API_KEY` (and `OPENWEATHER_API_KEY` for the weather case)
- ~18 cases, ~2–3 minutes; writes a JSON report to `test-results/tool-matrix-<timestamp>.json`
- Filter one case: `pnpm test:tools -- --id=solo-code-chart` or `--id=chart-spec-smoke`
- `chart-spec-smoke` validates Recharts-ready chart specs and palette colors (`#22d3ee`, `#a78bfa`, …) offline
- `solo-code-chart` live-tests code execution + `charts[]`; warns if the model omits chart data (known flakiness)
- Verbose router/response logs: set `NEXT_PUBLIC_DEBUG_TOOLS=true` in `.env.local`

Console lines look like:

```text
[tool-matrix] solo-search PASS 7.3s route=3.4s llm=3.8s tools=google_search steps=google_search_call,... custom=none
```

`PASS*` means passed with warnings (e.g. native tool not invoked when the model answered from memory). Failures exit with code 1.

## PWA install

- **Android (Chrome):** Install app prompt or menu → Install
- **iPhone/iPad (Safari):** Share → Add to Home Screen

## iOS / PWA audio & camera notes

- Mic is requested on **Connect**; camera on **Open camera** (both require user tap — Safari)
- Camera and mic require **HTTPS** on LAN devices (use `pnpm dev:https`)
- MIME types are detected via `MediaRecorder.isTypeSupported()` (prefers `audio/mp4` / `audio/ogg` over WebM)
- WebM and other unsupported recorder formats are converted to WAV client-side before Gemini STT
- Media tracks are stopped on tab hide, page unload, and disconnect
- If mic fails in the installed PWA on iOS, use **Open in browser** or Safari directly

## Project structure

```
src/
├── app/                 # Next.js routes, PWA service worker
├── components/
│   ├── astra/           # Chrysty voice + camera UI shell
│   ├── agent-audio-visualizer-aura.tsx  # LiveKit Agents UI (shadcn)
│   └── ui/                # shadcn primitives
├── hooks/               # use-voice-agent, use-camera
└── lib/
    ├── agent-state.ts     # Session phase machine
    ├── audio/             # Mic + MIME helpers
    ├── camera/            # Capture, frame buffer, sharpness
    ├── gemini/            # Multimodal response + TTS + tool router
    └── streaming/         # SSE consumption types
docs/
└── camera-vision.md     # Camera architecture & extension hooks
```

## Next phase (not built yet)

- Short video keyframe capture (3–10 s clips) — see [docs/camera-vision.md](docs/camera-vision.md)
- Gemini Live API / Mastra agent integration
- Enable `TranscriptSlot` for streaming text
