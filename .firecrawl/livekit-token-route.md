LiveKit docs › Components › Miscellaneous › NextJS API Token Route

---

# Next.js API Token Route

> A NextJS API route to generate a LiveKit session token while keeping your API keys private.

## Usage

1. Add your LiveKit API keys to a `.env.local` file in your project root.

```env
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret
LIVEKIT_URL=your-livekit-url

```
2. Create a new  [TokenSource](https://docs.livekit.io/frontends/build/authentication/endpoint.md) that points your new `/api/token` endpoint.

```tsx
'use client';

import { useSession } from '@livekit/components-react';
import { AgentSessionProvider } from '@/components/agents-ui/agent-session-provider';
import MyAgent from '@/components/my-agent';

const TOKEN_SOURCE = TokenSource.endpoint('/api/token');

export function Demo() {
  const session = useSession(TOKEN_SOURCE);

  return (
    <AgentSessionProvider session={session}>
      <MyAgent />
    </AgentSessionProvider>
  );
}

```

## Features

- Generates a LiveKit session token using a NextJS API route
- Keeps your API keys private

> 🔥 **This route requires authentication in production**
> 
> This route is insecure by default to enable local development.

## Installation

```bash
pnpm dlx shadcn@latest add @agents-ui/nextjs-api-token-route

```

---

This document was rendered at 2026-07-02T09:18:35.339Z.
For the latest version of this document, see [https://docs.livekit.io/reference/components/agents-ui/component/nextjs-api-token-route.md](https://docs.livekit.io/reference/components/agents-ui/component/nextjs-api-token-route.md).

To explore all LiveKit documentation, see [llms.txt](https://docs.livekit.io/llms.txt).