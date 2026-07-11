# Learning app — Ask Chrysty integration

Copy `packages/live-embed` into the learning repo (same as `packages/platform`).

## 1. `package.json`

```json
"@chrysty/live-embed": "file:../packages/live-embed"
```

## 2. Root layout

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

## 3. Mission reader page

```tsx
import { AskChrystyButton, ChrystyHostContext } from '@chrysty/live-embed';

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
  <AskChrystyButton />
</ChrystyHostContext>
```

## Env

```
NEXT_PUBLIC_ASTRA_EMBED_URL=https://chrysty.chrysty.dev
```

User must be signed in (shared `.chrysty.dev` SSO) for bootstrap + Live memory.
