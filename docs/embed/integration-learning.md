# Learning app — Ask Chrysty integration

Copy `packages/live-embed` into the learning repo (same as `packages/platform`), or depend on the Astra package path during monorepo work.

Source of truth: Astra `packages/live-embed` on branch `contextual-daily-assistance`.

## 1. `package.json`

```json
"@chrysty/live-embed": "file:packages/live-embed"
```

Build via postinstall: `npm run build --prefix packages/live-embed`.

## 2. Root layout — one provider

```tsx
import { ChrystyLiveEmbedProvider } from '@chrysty/live-embed';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ChrystyLiveEmbedProvider
          worker="tutor"
          astraEmbedUrl={process.env.NEXT_PUBLIC_ASTRA_EMBED_URL ?? 'https://chrysty.chrysty.dev'}
        >
          {children}
        </ChrystyLiveEmbedProvider>
      </body>
    </html>
  );
}
```

## 3. App shell — one FAB + default host context

Mount the button once in the persistent workspace shell (not inside mission pages).

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

## 4. Mission (or page) — nested HostContext upgrade only

Upgrade title/capture for the focused surface. Do **not** add a second `AskChrystyButton`.

```tsx
<ChrystyHostContext
  source="learning_mission"
  entityId={session.id}
  title={`${session.title} · Mission ${mission.index}`}
  captureTarget="#mission-content"
  worker="tutor"
>
  <div id="mission-content" data-chrysty-capture>
    {/* existing mission card content */}
  </div>
</ChrystyHostContext>
```

## Package behavior

- FAB shows Astra’s cyan Aura mark; toggles a docked Live panel (page stays visible)
- Iframe stays mounted while open; context/capture update on navigation
- Live audio runs only inside `chrysty.chrysty.dev/embed/live`

## Env

```
NEXT_PUBLIC_ASTRA_EMBED_URL=https://chrysty.chrysty.dev
```

User must be signed in (shared `.chrysty.dev` SSO) for bootstrap + Live memory.

## Before Content / Ledger / Practice rollout

Follow [device-gate.md](./device-gate.md). Do not invent a second Live stack in the host app.
