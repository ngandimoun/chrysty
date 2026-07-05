# Camera & Vision Architecture

Chrysty V1 adds **photo capture**, **live and post-capture photo annotation**, **selfie mode**, and **live camera preview** with a **smart snapshot** sent alongside voice when the user finishes talking. Nothing is streamed continuously to the model — manual captures send up to **7** still images per turn (plus audio), or **one** smart snapshot when no manual captures exist.

The product direction is mobile-first physical AI: Chrysty helps users understand and act on real-world context through camera/photos, voice, recent conversation, memory, and relevant Gemini/custom tools. It should infer the user’s actual task instead of forcing a fixed blue-collar template.

## Product modes

| Mode | User action | What gets sent | Example prompts |
|------|-------------|----------------|-----------------|
| **Photo** | Draw on the live preview if needed, tap **Capture photo** (up to 7), then talk | All captured stills + audio | "Which of these is ripe?", "Compare these two options" |
| **Selfie** | Open camera → flip to front → draw if needed → talk | Front-camera smart snapshot + audio | "Does this shirt fit?", "Do I look ready for this interview?" |
| **Live + smart snapshot** | Open camera, draw if needed, then record; tap Stop & send (no manual captures) | Best marked frame from while speaking + audio | "Which one should I buy?", "Read this menu", "Solve number 6" |

### Physical AI behavior

Chrysty should handle broad, ongoing real-world tasks, for example:

- Identifying parts, labels, materials, damage, tools, paperwork, receipts, plants, food, safety signs, or instructions.
- Giving relevant step-by-step guidance for the user’s current stage.
- Continuing from previous turns: if the user already tried a step, answer from that new state.
- Asking one focused clarification when the next safe step depends on hidden information.
- Using examples, checks, measurements, or “what good looks like” details when they help the user act.
- Suggesting next checks or useful follow-up questions only when they naturally help.

Gemini tools and Chrysty custom tools remain part of the flow. Use them when a task needs current facts, manuals, recalls, product compatibility, nearby supplies, calculations, conversions, weather, user context, or other external grounding.

### Structured physical responses

For physical-world turns, Chrysty can return structured task guidance in addition to the spoken response and markdown explanation:

- `task_state`: the inferred project, current stage, progress, and confidence.
- `observed_evidence`: what Chrysty can see, read, or infer from camera/photos, perception, tools, memory, or recent turns.
- `next_actions`: ordered steps for the current stage, with checks/examples when useful.
- `safety_notes`: hazards, uncertainty, stop conditions, or professional-help boundaries.
- `follow_up_suggestions`: specific next questions/checks only when they are natural.
- `visual_annotations`: optional labels/regions for visible items when the image supports localization.

The UI renders these as practical task sections before the normal rich explanation. Existing features still work: markdown explanations, charts, stock images, Maps cards, web citations, code execution images, custom tool badges, generated documents, reference documents, memory, and audio saving.

Use the examples in product thinking as behavioral smoke tests, not runtime categories. Chrysty should learn broad capabilities — identify, read, compare, locate, guide, verify, estimate, warn, remember, and coach — across any real environment.

### Multi-photo capture

- Tap **Capture photo** up to **7** times; each capture appends to a pending queue (not a replace).
- Draw one or more live annotations before tapping **Capture photo** to save the marked frame immediately.
- A thumbnail strip appears in the main section with a counter (`3 / 7`).
- Tap a thumbnail to add or edit visible annotations before sending. You can stack multiple `circle`, `rect`, `highlight`, `arrow`, and `pointer` marks on the same photo.
- Tap **X** on a thumbnail to remove that photo while continuing to capture others.
- Tap **End** to disconnect and **clear all** pending photos.
- Closing the camera does **not** clear pending photos — you can review thumbnails and record with the camera off.
- On **Stop & send**, all pending photos are sent with the audio, then the queue is cleared.

### Smart snapshot

While the user is recording (tap Record → Stop & send on all devices):

1. Sample sharpness/luminance scores ~5 times per second from a small analysis canvas (no JPEG encoding yet).
2. On release/stop, pick the best score from the buffer.
3. Encode **one** downscaled JPEG from the current video frame (Clicky-style: capture at key-up).
4. If live annotations exist, burn them into that JPEG and include the same `focusAnnotations` metadata.
5. Send that JPEG with the audio.

If the user captured photos first (**pending photos**), those images override the smart snapshot for the next send. Any unsaved live annotations are cleared once the pending photos are consumed.

### Camera controls

The live preview exposes modern camera tools on top of the existing flip, torch, annotation, and shutter controls:

| Control | UI | Behavior |
|---------|-----|----------|
| **Zoom** | Pinch on preview, right-edge slider, +/- buttons | Uses `MediaStreamTrack.applyConstraints({ zoom })` when the device exposes zoom capabilities |
| **Grid** | Grid toggle in the tools pill | Rule-of-thirds overlay on the preview only (not burned into captures) |
| **Self-timer** | Timer toggle cycles Off → 3s → 5s → 10s → 15s → 30s | Countdown on the shutter; tap the number to cancel |
| **Aspect ratio** | Ratio toggle cycles 16:9 → 4:3 → 1:1 | Re-acquires the camera stream with an `aspectRatio` constraint and resizes the preview shell |
| **Exposure** | Sun icon opens a +/- stepper | Uses `exposureCompensation` when supported |
| **Tap to focus** | Quick tap on the preview (no drag) | Uses `pointsOfInterest` / manual focus when supported; shows a brief reticle |

Capability detection runs after every stream open, flip, or aspect-ratio change. Unsupported controls are hidden rather than faked (for example, no CSS-only zoom, because that would not improve captured stills).

**Browser limits:**

- **iOS Safari:** torch is generally unavailable; zoom, exposure, and tap-to-focus support varies by device/OS version.
- **Android Chrome:** zoom and torch are most reliable on rear cameras.
- **Desktop:** many controls are hidden when the track does not expose the relevant capabilities.

Implementation modules: `src/lib/camera/track-controls.ts`, `src/lib/camera/aspect-ratio.ts`, `src/hooks/use-camera.ts`, and the `camera-*` preview components under `src/components/astra/`.

## Physical AI encode pipeline

Chrysty follows the same cost/latency pattern as the earlier Clicky-style still-image pipeline, but optimized for mobile camera/photos:

```
Preview local (full camera resolution, no upload)
    ↓
User talks (audio records; scores sampled locally only)
    ↓
User releases / stops
    ↓
Stop audio recorder
    ↓
Live annotations are mapped from preview space to image space
    ↓
prepareVideoFrameForModel() — ONE encode:
  • Longest edge capped at 1280px (aspect ratio preserved)
  • JPEG quality 0.8
    ↓
POST FormData: audio + images[] + imagesMeta
    ↓
Server passes bytes through unchanged (no re-encode after client annotation burn-in)
    ↓
Gemini Interactions: base64 image/jpeg + audio
```

### Encode constants

| Constant | Value | Module |
|----------|-------|--------|
| Max longest edge | 1280 px | `src/lib/camera/encode.ts` |
| Format | JPEG only (camera captures) | `encode.ts` |
| Quality | 0.8 | `encode.ts` |
| Analysis sample width | 320 px | `src/lib/camera/capture.ts` |

### Example encoded dimensions

| Camera shape | Native example | Encoded size |
|--------------|----------------|--------------|
| 16:9 landscape | 1920×1080 | 1280×720 |
| 16:10 laptop | 3024×1964 | 1280×831 |
| Portrait phone | 1080×1920 | 720×1280 |

### Payload size (typical)

- Per-image JPEG: ~100–500 KB (varies with scene complexity; annotated photos may be slightly larger)
- Base64 in Gemini request adds ~33% vs raw bytes
- Up to 7 manual photos per turn, or one smart snapshot when no manual captures exist

Set `NEXT_PUBLIC_DEBUG_CAPTURE=true` to log `{ width, height, bytes, captureMode, focusAnnotations }` in the browser console on send.

### What is NOT sent

- Not the native/Retina camera resolution (e.g. 4K or 3024×1964)
- Not PNG for camera captures
- Not frames during recording or STT — only scores are sampled locally
- Not continuous video to the model
- Not re-compressed by the server API route
- Not freehand markup or arbitrary polygons in V1

## End-to-end data flow

```
User connects (mic)
    ↓
Optional: open camera preview (getUserMedia video)
    ↓
User talks (hold mobile / tap desktop)
    ↓
Frame buffer samples preview while recording
    ↓
On stop: pick best frame OR use pending photos
    ↓
POST /api/respond/stream  (FormData: audio + optional images[])
    ↓
buildVoiceResponseFromMultimodal → Gemini Interactions API
    ↓
SSE: explanation_* events + TTS audio
    ↓
Client plays speech + shows explanation canvas
```

## File map

| Path | Role |
|------|------|
| `src/lib/camera/types.ts` | `CameraFacing`, `CaptureMode`, `CameraError` |
| `src/lib/camera/camera.ts` | Acquire/release video stream, facing switch, HTTPS checks |
| `src/lib/camera/encode.ts` | Downscale (1280 longest edge) + JPEG 0.8 encode for model upload |
| `src/lib/camera/annotate.ts` | Burn `circle` / `rect` / `highlight` / `arrow` / `pointer` overlay into captured JPEG |
| `src/lib/camera/annotation-coordinates.ts` | Map live preview annotations to encoded image coordinates, including mirrored selfie correction |
| `src/lib/camera/capture.ts` | Sharpness/luminance scoring (analysis canvas only) |
| `src/lib/camera/frame-buffer.ts` | Score-only ring buffer during recording; single encode on stop |
| `src/hooks/use-camera.ts` | React hook: preview stream, multi-photo queue, sampling |
| `src/hooks/use-voice-agent.ts` | Recording + FormData upload with optional images |
| `src/components/astra/camera-preview.tsx` | Live `<video>` preview (`playsInline`, mirrored selfie) |
| `src/components/astra/focus-annotation-overlay.tsx` | Shared live/post-capture annotation overlay UI |
| `src/components/astra/photo-annotation-editor.tsx` | Full-screen post-capture annotation editor |
| `src/components/astra/photo-strip.tsx` | Thumbnail strip with per-photo delete |
| `src/components/astra/visualizer-slot.tsx` | Aura ↔ camera ↔ explanation priority |
| `src/components/astra/voice-controls.tsx` | Camera / flip / hold-to-talk / record buttons |
| `src/components/astra/astra-voice-shell.tsx` | Wires mic + camera + agent |
| `src/lib/gemini/response-prompt.ts` | Multimodal Interactions input (text + image + audio) |
| `src/app/api/respond/stream/route.ts` | Parses multipart form, streams SSE response |

## API contract: `POST /api/respond/stream`

`multipart/form-data` fields:

| Field | Required | Description |
|-------|----------|-------------|
| `audio` | Yes | Recorded speech (WAV/M4A/etc.) |
| `mimeType` | Yes | Normalized audio MIME type |
| `audioDurationMs` | No | Client-measured duration |
| `userTimezone` | No | IANA timezone from the browser (e.g. `Europe/Paris`) |
| `userLocale` | No | Browser locale (e.g. `en-US`) |
| `clientTimestamp` | No | ISO 8601 timestamp when the user sent the request |
| `userLatitude` | No | Optional geolocation latitude (best-effort) |
| `userLongitude` | No | Optional geolocation longitude (best-effort) |
| `geoAccuracyMeters` | No | Optional geolocation accuracy in meters |
| `images` | No | One or more JPEG still frames (repeat field; max 7, each max 1280px longest edge, quality 0.8) |
| `imagesMeta` | No | JSON array matching `images` order: `{ mimeType, width, height, captureMode, focusAnnotations?, perception? }` |
| `image` | No | Legacy single-image field (backward compatible) |
| `imageMimeType` | No | Legacy single-image MIME type |
| `imageWidth` | No | Legacy encoded pixel width |
| `imageHeight` | No | Legacy encoded pixel height |
| `captureMode` | No | Legacy `none` \| `photo` \| `smart_snapshot` |

Limits: audio 20 MB, each image 10 MB, max 7 images per request.

`focusAnnotations` schema:

```json
[
  {
    "id": "a1",
    "shape": "rect",
    "x": 0.34,
    "y": 0.27,
    "width": 0.31,
    "height": 0.22,
    "startX": 0.34,
    "startY": 0.27,
    "endX": 0.65,
    "endY": 0.49
  }
]
```

- `shape`: `circle` | `rect` | `highlight` | `arrow` | `pointer`
- `id`: stable client-side annotation ID
- `x`, `y`, `width`, `height`: normalized 0-1 fractions of encoded image size
- `startX`, `startY`, `endX`, `endY`: optional normalized endpoints used by directional shapes like `arrow`
- Omit `focusAnnotations` when the user skipped annotation
- The image itself also contains the visible mark because the client burns it into the JPEG before upload

## Perception V1

Chrysty now has a capability-first perception layer. Users do not see library/model names in the UI; they see friendly states like **Reading text**, **Scanning code**, **Finding objects**, or **Looking at the scene**.

V1 capabilities:

- **Code Scanner** — QR/barcode scanning, lazy-loaded when the camera/profile needs it.
- **Text Reader** — OCR, on demand or slow cadence.
- **Object Finder** — ONNX object detection boundary for configured YOLO assets.
- **Hand/Pose/Face/Gesture awareness** — MediaPipe runtime boundary for configured model assets.
- **Scene Change Monitor** — compact current-scene and recent-event summaries.

The browser sends compact `perception` metadata inside `imagesMeta` when available:

```json
{
  "version": 1,
  "profile": "general",
  "capturedAt": "2026-07-04T00:00:00.000Z",
  "scene": {
    "objects": [],
    "text": [],
    "codes": [],
    "people": [],
    "hands": [],
    "gestures": [],
    "lastUpdated": "2026-07-04T00:00:00.000Z"
  },
  "events": [],
  "detectorHealth": []
}
```

Server-side validation treats this metadata as optional hints. Malformed perception metadata is sanitized or dropped; it should not break a voice turn.

Large or advanced models such as browser CLIP, SAM, Depth Anything, and large vision-language models are intentionally not part of V1. Gemini remains the primary multimodal reasoning model for high-level scene understanding.

### Real browser tests

Run the full perception browser integration suite:

```bash
pnpm test:perception
```

This script prepares synthetic fixtures/model assets, builds/starts the Next app through Playwright, opens the gated `/perception-test` route, and asserts real browser outcomes without calling Gemini, Supabase, Mem0, or `/api/respond/stream`.

Current real outcomes:

- ZXing decodes a synthetic QR fixture and returns the exact expected value.
- Tesseract.js reads a synthetic text fixture and returns the expected phrase.
- ONNX Runtime Web loads a tiny MatMul `.onnx` model and returns the expected numeric tensor output.
- MediaPipe Tasks Vision loads the browser runtime and hand landmarker model, then runs a blank-scene fixture through the model.
- Chrysty's perception context path produces a sanitized `PerceptionSnapshot` and Gemini prompt block.
- The browser `PerceptionManager` runs against a fixture-backed video stream and reports detector health/scene metadata.

Run against a Vercel preview by enabling the test route in that deployment and setting:

```bash
PLAYWRIGHT_BASE_URL=https://your-preview-url pnpm test:perception
```

The test route is gated by `ENABLE_PERCEPTION_TEST_ROUTE=true` or `NEXT_PUBLIC_ENABLE_PERCEPTION_TEST_ROUTE=true`; do not enable it for normal production traffic.

## Gemini voice pipeline

Voice turns use a **transcribe-first** pipeline (audio is never sent alongside tools — Gemini rejects decoded PCM with `code_execution`):

1. **STT** — `transcribeAudioToText` on normalized `audio/wav` (no tools)
2. **Tool router** — lightweight structured JSON call selects which tools this turn needs
3. **Response** — transcript text + optional camera images + **only selected tools**

```typescript
// Step 3 input (no audio part)
input: [
  { type: 'text', text: 'User said:\n"""..."\n\nRespond with structured JSON.' },
  { type: 'image', data: base64, mime_type: 'image/jpeg' }, // optional
]
```

When any attached camera image includes `focusAnnotations`, the prompt also adds:

> The user highlighted a region - prioritize analysis inside the marked area.

Client audio is normalized to **`audio/wav`** before upload (Safari/iPad M4A and WebM are decoded and re-encoded).

**Model:** `GEMINI_RESPONSE_MODEL` (default `gemini-3.1-flash-lite`). For harder vision tasks, set `GEMINI_RESPONSE_MODEL=gemini-3.5-flash` in `.env.local`.

### Tool routing (catalog + conflict resolution)

The router ([`tool-catalog.ts`](src/lib/gemini/tool-catalog.ts) + [`voice-tool-router.ts`](src/lib/gemini/voice-tool-router.ts)) selects a minimal subset per turn; deterministic post-processing prevents overlapping tools.

**Categories** (pick at most one per task):

| ID | Category | Best for | Do NOT use for |
|----|----------|----------|----------------|
| `google_search` | web | Live news, prices, events | Places/near me, known URLs |
| `google_maps` | geo | Near me, directions, POI | News, URL reading |
| `url_context` | web | Spoken URLs, deep page read | Broad discovery, places |
| `code_execution` | compute | Receipts, charts, multi-step stats | Simple `%` or arithmetic |
| `custom_tools` | compute | calculator, dates, convert, weather, random | Multi-row receipts/charts |

**Allowed pairs:** `google_search` + `url_context`, `google_search` + `custom_tools`, `google_maps` + `custom_tools`.

**Example routing:**

| Transcript | Selected tools |
|------------|----------------|
| "Hey, how are you?" | none |
| "What is 15% of 280?" | `custom_tools` only |
| "Best coffee near me" | `google_maps` only |
| "What's in the news about AI?" | `google_search` only |
| "Find recipes then compare two pages" | `google_search` + `url_context` |
| Receipt photo + "add up the total" | `code_execution` only |

Set `NEXT_PUBLIC_DEBUG_TOOLS=true` to log raw vs resolved selection in the server console during development.

**Custom tool storage:** Turns that select `custom_tools` briefly use `store=true` on the response interaction so the client-side function-calling loop can continue via `previous_interaction_id`. Stored interaction IDs are deleted best-effort after the turn completes. If storage is unavailable, a stateless fallback injects executed tool results into the prompt instead.

Token billing: built-in tool steps count toward prompt tokens on continuation turns. Search/Maps billed per query. URL content as `tool_use_input_tokens`. Search is not double-charged at the token level. STT + router add ~1–2s latency vs the old single-call audio-in path.

### Google Search grounding

When `GEMINI_ENABLE_GOOGLE_SEARCH=true` (default), the response interaction includes the built-in `google_search` tool. **The model decides per request whether to search** — most turns (greetings, image questions, general knowledge) should not trigger a search. Search is intended only for live or time-sensitive facts (weather, news, prices, schedules, etc.).

The client sends the user's timezone, locale, timestamp, and optional geolocation on every request so the model knows the user's local "now" and "today" — both for search queries and for time-aware answers without searching.

When search grounding is used, source URLs appear as structured **Sources** cards on the explanation canvas (not inline plain text). SSE events `search_start` and `search_done` are emitted for optional UI feedback.

Disable with `GEMINI_ENABLE_GOOGLE_SEARCH=false` to skip search (lower latency, no search billing).

### Google Maps grounding

When `GEMINI_ENABLE_GOOGLE_MAPS=true` (default), the response interaction includes the built-in `google_maps` tool. **The model decides per request whether to use Maps** — only for geographically relevant queries (nearby restaurants, directions, local recommendations, itinerary planning).

- User `latitude` / `longitude` are passed to the tool when geolocation is available (best for "near me")
- Without GPS, Maps can still answer city-specific queries (e.g. "restaurants in Paris")
- Maps grounding works best in **English** for place names and categories

When Maps is used, the explanation canvas shows:
- A rich markdown summary (bold, tables, math as needed)
- **Place cards** with name, review snippet, and Google Maps links
- Required **Google Maps** source attribution

SSE events: `maps_start`, `maps_done`, and `places[]` on `explanation_start` / `explanation_done`.

Disable with `GEMINI_ENABLE_GOOGLE_MAPS=false`.

Gemini 3 Maps billing is per search query the model executes (same model as Search).

### Code execution and charts

When `GEMINI_ENABLE_CODE_EXECUTION=true` (default), the response interaction includes the built-in `code_execution` tool. **The model decides per request whether to run Python** — most turns (greetings, small talk, simple facts) should not trigger code. Code is intended for precise computation: math, statistics, unit conversions, numeric breakdowns, receipt totals, and data extracted from attached camera images.

When code produces visualizable results:

- Set `needs_visual_explanation: true` with a short summary in `explanation_text`
- Populate `charts[]` in the structured JSON response with Recharts-ready data (bar, line, pie, area)
- The explanation canvas renders charts after the rich summary fade-in completes
- If the model omits `charts[]` but returns matplotlib inline images from code execution, those are shown as a fallback labeled "Computed visualization"

SSE events: `code_start`, `code_done`, plus `charts[]` and `codeImages[]` on `explanation_start` / `explanation_done`.

Disable with `GEMINI_ENABLE_CODE_EXECUTION=false`.

Code execution tokens are billed as normal input/output tokens per Gemini pricing (no extra tool fee).

### URL context (voice-first)

When `GEMINI_ENABLE_URL_CONTEXT=true` (default), the response interaction includes the built-in `url_context` tool. **The model decides per request whether to fetch URLs** — most turns should not. URL context is for deep-reading specific public web pages when URLs are available from:

- **Spoken URLs** in the user's voice message (e.g. "read example dot com slash docs")
- **Camera images** showing a URL on screen, printout, or label
- **Search + URL context combo** — user names sites or topics; Search discovers pages; URL context reads them for comparison or synthesis (recipes, docs, articles, PDFs)

Voice-first output rules:

- `spoken_transcript` stays short — never read long URLs aloud
- Comparisons, lists, and excerpts go in `explanation_text` on the explanation canvas
- Source URLs appear as structured **Sources** cards on the explanation canvas (same as Search grounding)

Tool routing: **Search** = discover live facts; **URL context** = deep read of specific pages; **Maps** = places; **code execution** = computation.

SSE events: `url_start`, `url_done`.

Disable with `GEMINI_ENABLE_URL_CONTEXT=false`.

Retrieved URL content is billed as `tool_use_input_tokens` per Gemini pricing.

### Custom function tools (GA Interactions combo)

When `GEMINI_ENABLE_CUSTOM_TOOLS=true` (default), Chrysty registers custom function tools **in the same interaction** as built-in tools (Search, Maps, URL context, code execution). Gemini 3 tool context circulation preserves built-in tool results when custom tools run.

Starter custom tools:

| Tool | When registered | Voice use |
|------|-----------------|-----------|
| `calculator` | Always | "What's 15% of 280?" — safe arithmetic without Python |
| `processDate` | Always | "How many days until Dec 25?" — date/time in user timezone |
| `convert` | Always | "5 miles to km", "100 USD to EUR" (Frankfurter live rates) |
| `randomChoice` | Always | "Pick pizza or sushi" — unbiased random selection |
| `getUserContext` | Always | "What timezone am I in?" — timezone, locale, local time, optional GPS |
| `getWeather` | When `OPENWEATHER_API_KEY` is set | "What's the weather in …?" — often after Search finds the place |

Prefer **custom tools over code_execution** for single-step calculator, date, convert, and random tasks. Use **code_execution** for receipts, image analysis, statistics over many rows, and charts[].

The server runs a function-call loop (up to 5 rounds) using `previous_interaction_id` + `function_result` per the Interactions API. Custom tools auto-execute server-side in the same voice turn — no user confirmation or manual step required. Results feed back into the model before structured JSON is returned.

Voice-first: keep `spoken_transcript` short; put computed values, conversions, and lists in `explanation_text` using **bold**, tables, and math where helpful.

### Rich explanation canvas

All visual explanations render on **ExplanationCanvas** with rich formatting:

- **Markdown** (GFM): headings, lists, tables, bold emphasis for tool results
- **Math** via KaTeX: inline `$…$` and block `$$…$$` equations
- **Chemistry** via mhchem: `\ce{H2O}`, `\ce{CO2 + H2O -> H2CO3}`
- **Emoji** (unicode and `:shortcode:`) for scanability
- **Sources cards** for Search and URL context citations
- **Tool badges** when custom tools ran (calculator, convert, etc.)
- **Charts** with locale-aware number formatting on axes and tooltips

During SSE streaming, a plain-text preview is shown; once complete, the full rich render fades in synced to TTS duration.

SSE events: `custom_tool_start`, `custom_tool_done` with `{ tools: [...] }`.

Disable with `GEMINI_ENABLE_CUSTOM_TOOLS=false`.

## Talk UX

All platforms use **tap toggle**: **Record** → **Stop & send**. Camera and flip can be used while recording; frame sampling starts when the preview is ready (including mid-recording).

## Device & browser matrix

| Environment | Camera | Notes |
|-------------|--------|-------|
| Desktop Chrome / Edge / Firefox | Supported | Tap-to-record; camera can open during recording |
| Android Chrome | Supported | Tap-to-record; rear/front flip; flashlight toggle on rear camera when browser exposes torch |
| iPhone Safari | HTTPS required | `playsInline` video; user gesture to open camera; no web flashlight API |
| iPad Safari / PWA | HTTPS required | Same as iPhone; if camera fails in PWA, open in Safari |
| HTTP LAN dev | Mic + camera blocked | Use `pnpm certs:install` + `pnpm dev:https` |

### Permission model

- **Microphone:** requested on **Connect** (unchanged).
- **Camera:** requested on **Open camera** (separate permission, Safari-friendly).

Tracks are stopped on disconnect, tab hide, and `pagehide`. The flashlight turns off when the camera closes or the user switches to the front camera.

### Flashlight (torch)

- **Control:** flashlight icon in the top control row (next to flip), visible only when the rear camera is open and `MediaStreamTrack` reports torch support.
- **Android Chrome / Chromium browsers:** usually supported on the rear camera via `applyConstraints({ torch })`.
- **iOS Safari:** not supported — the button is hidden.
- **Desktop:** not supported — the button is hidden.

## Phase 2 (deferred): short video keyframes

For movement-heavy tasks ("watch me tighten this bolt", squat form, scanning a long receipt):

1. Record 3–10 s of preview video locally while user talks.
2. Extract 5–20 key frames client-side.
3. Send audio + multiple images to the model.

**Hook points (do not implement in V1):**

- `src/lib/camera/frame-buffer.ts` — extend to retain temporal sequences
- New `src/lib/camera/video-keyframes.ts` — MediaRecorder + frame extraction
- `FormData` — `images[]` or `keyframeCount` field
- `buildVoiceResponseFromMultimodal` — multiple image parts in `input`

## Future library integrations

| Integration | Where to plug in |
|-------------|------------------|
| **Gemini Live API** | Replace tap/hold record with WebSocket session; keep camera preview local, still send snapshots on turn end |
| **Mastra agent** | New tool in agent that accepts `{ audioUri, imageUri }`; shell keeps same FormData contract |
| **Third-party vision SDK** | Pre-process image in `getVisualCapture()` before append to FormData |
| **On-device ML (e.g. MediaPipe)** | Run in `capture.ts` before upload for blur detection or object ROI |

The UI shell (`AstraVoiceShell` + `useCamera` + `getVisualCapture`) should remain the boundary — swap backends without rewriting controls.
