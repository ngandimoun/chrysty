LiveKit docs › Components › Session management › AgentSessionProvider

---

# Agent Session Provider

> A context provider for the LiveKit agent session.

## Usage

**[AgentSessionProvider](https://docs.livekit.io/reference/components/agents-ui/component/agent-session-provider.md)** preview:

```tsx
'use client';

import { useSession } from '@livekit/components-react';
import { AgentSessionProvider } from '@/components/agents-ui/agent-session-provider';

const TOKEN_SOURCE = TokenSource.endpoint('/api/token');

export function Demo() {
  const session = useSession(TOKEN_SOURCE);

  return (
    <AgentSessionProvider session={session}>
      {/* Agent UI application components go here */}
    </AgentSessionProvider>
  );
}
```

## Features

- Provides the agent session to the descendant components
- Ensures remote participants’ audio tracks (microphones and screen share) are audible

## Installation

```bash
pnpm dlx shadcn@latest add @agents-ui/agent-session-provider

```

## Props

| Prop name | Type | Default |
| --------- | ---- | ------- |
| `session` | UseSessionReturn | – |
| `children` | ReactNode | – |
| `room?` | Room | – |
| `volume?` | number | – |
| `muted?` | boolean | – |

---

This document was rendered at 2026-07-02T09:18:33.159Z.
For the latest version of this document, see [https://docs.livekit.io/reference/components/agents-ui/component/agent-session-provider.md](https://docs.livekit.io/reference/components/agents-ui/component/agent-session-provider.md).

To explore all LiveKit documentation, see [llms.txt](https://docs.livekit.io/llms.txt).