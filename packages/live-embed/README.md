# @chrysty/live-embed

Host-side **Ask Chrysty** embed for sibling Chrysty apps (Learning, Content, Ledger, …).

Live mic/WebSocket runs inside an iframe on `chrysty.chrysty.dev/embed/live` — this package does **not** reimplement Live.

## Install (same pattern as `@chrysty/platform`)

```json
"@chrysty/live-embed": "file:../packages/live-embed"
```

## Usage

```tsx
// layout.tsx
import { ChrystyLiveEmbedProvider } from '@chrysty/live-embed';

<ChrystyLiveEmbedProvider worker="tutor" astraEmbedUrl="https://chrysty.chrysty.dev">
  {children}
</ChrystyLiveEmbedProvider>

// page.tsx
import { ChrystyHostContext, AskChrystyButton } from '@chrysty/live-embed';

<ChrystyHostContext
  title="Quantum mechanics · Mission 2"
  entityId={sessionId}
  captureTarget="#mission-content"
  worker="tutor"
>
  <div id="mission-content" data-chrysty-capture>{content}</div>
  <AskChrystyButton />
</ChrystyHostContext>
```

See [docs/embed/integration-learning.md](../../docs/embed/integration-learning.md) in the Astra repo.
