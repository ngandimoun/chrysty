# @chrysty/live-embed

Host-side **Ask Chrysty** embed for sibling Chrysty apps (Learning, Content, Ledger, Practice, …).

Live mic/WebSocket runs inside an iframe on `chrysty.chrysty.dev/embed/live` — this package does **not** reimplement Live.

## Install (same pattern as `@chrysty/platform`)

```json
"@chrysty/live-embed": "file:packages/live-embed"
```

Or from the Astra monorepo sibling path:

```json
"@chrysty/live-embed": "file:../packages/live-embed"
```

Run `postinstall` / `npm run build --prefix packages/live-embed` so `dist/` exists.

## Golden path (Learning pilot)

Do this so the FAB stays site-wide and Live does not remount on every navigation.

### 1. Root layout — one provider

```tsx
import { ChrystyLiveEmbedProvider } from '@chrysty/live-embed';

<ChrystyLiveEmbedProvider
  worker="tutor"
  astraEmbedUrl={process.env.NEXT_PUBLIC_ASTRA_EMBED_URL ?? 'https://chrysty.chrysty.dev'}
>
  {children}
</ChrystyLiveEmbedProvider>
```

### 2. App shell — one FAB + default host context

Mount `AskChrystyButton` once in the persistent shell (not on every page).

```tsx
import { AskChrystyButton, ChrystyHostContext } from '@chrysty/live-embed';

<ChrystyHostContext
  source="learning_workspace"
  title="Learn"
  captureTarget="#workspace-content"
  worker="tutor"
  entityId={pathname}
>
  <main id="workspace-content" data-chrysty-capture>
    {children}
  </main>
  <AskChrystyButton />
</ChrystyHostContext>
```

### 3. Page upgrade — nested HostContext only

On a mission (or any focused surface), wrap content to upgrade capture/title. Do **not** mount a second FAB.

```tsx
<ChrystyHostContext
  source="learning_mission"
  entityId={session.id}
  title={`${session.title} · Mission ${mission.index}`}
  captureTarget="#mission-content"
  worker="tutor"
>
  <div id="mission-content" data-chrysty-capture>
    {/* mission content */}
  </div>
</ChrystyHostContext>
```

## Behavior (built into the package)

- FAB uses Astra’s cyan **Aura** idle mark (not a chat bubble); click toggles open/close
- Live opens as a **docked panel** (bottom-right), not a full-page overlay
- Iframe `src` is frozen while open; host context/capture updates via postMessage on nav
- Mic/audio stay inside Astra `/embed/live`

## Env

```
NEXT_PUBLIC_ASTRA_EMBED_URL=https://chrysty.chrysty.dev
```

User must be signed in (shared `.chrysty.dev` SSO) for bootstrap + Live memory.

## Before sibling prod

Complete [docs/embed/device-gate.md](../../docs/embed/device-gate.md) on real devices (including Desktop Chrome side-by-side: standalone Live vs embed).

## Anti-patterns

| Don’t | Do |
|-------|-----|
| Nest multiple providers | One provider in root layout |
| Mount FAB on every page / mission | One FAB in the shell |
| Put capture + FAB only on leaf pages | Shell default HostContext + nested upgrades |
| Full-screen host overlay | Use package docked panel |
| Remount iframe on route change | Keep open; send context/capture updates |
| Reimplement mic/Live in the host | Iframe to Astra only |
| Ship `mode: 'direct'` as a mic workaround | Fix `/embed/live` or host overlay per device-gate |

See also [docs/embed/integration-learning.md](../../docs/embed/integration-learning.md) and [docs/embed/postmessage-protocol.md](../../docs/embed/postmessage-protocol.md).
