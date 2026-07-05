LiveKit docs › Blocks › AgentSessionView - 01

---

# Agent Session View - 01

> A complete realtime agent session view with transcript, audio visualizer, and media controls.

## Usage

**[AgentSessionView_01](https://docs.livekit.io/reference/components/agents-ui/component/agent-session-view_01.md)** preview:

```tsx
'use client';

import { useSession } from '@livekit/components-react';
import { TokenSource } from '@/lib/token-source';
import { AgentSessionProvider } from '@/components/agents-ui/agent-session-provider';
import { AgentSessionView } from '@/components/agents-ui/blocks/agent-session-view-01/agent-session-view';

const TOKEN_SOURCE = TokenSource.sandboxTokenServer(
  process.env.NEXT_PUBLIC_SANDBOX_TOKEN_SERVER_ID
);

export default function Demo() {
  const session = useSession(TOKEN_SOURCE);

  return (
    <AgentSessionProvider session={session}>
      <AgentSessionView
        isPreConnectBufferEnabled="true"
        preConnectMessage={{preConnectMessage}}
        supportsChatInput={{supportsChatInput}}
        supportsVideoInput={{supportsVideoInput}}
        supportsScreenShare={{supportsScreenShare}}
        audioVisualizerType={{audioVisualizerType}}
        audioVisualizerColor={{audioVisualizerColor}}
        audioVisualizerColorShift={{audioVisualizerColorShift}}
        audioVisualizerBarCount={{audioVisualizerBarCount}}
        audioVisualizerGridRowCount={{audioVisualizerGridRowCount}}
        audioVisualizerGridColumnCount={{audioVisualizerGridColumnCount}}
        audioVisualizerRadialBarCount={{audioVisualizerRadialBarCount}}
        audioVisualizerRadialRadius={{audioVisualizerRadialRadius}}
        audioVisualizerWaveLineWidth={{audioVisualizerWaveLineWidth}}
      />
    </AgentSessionProvider>
  );
}
```

## Features

- Render a complete agent session surface with transcript and controls.
- Toggle chat, camera, and screen share support in the control bar.
- Show a pre-connect shimmer prompt before the first message arrives.
- Configure multiple audio visualizer styles and variant-specific options.
- Pass a custom `className` to extend layout styling.

## Installation

```bash
pnpm dlx shadcn@latest add @agents-ui/agent-session-view-01

```

## Props

| Prop name | Type | Default |
| --------- | ---- | ------- |
| `ref?` | Ref<HTMLElement> | – |
| `className?` | string | – |
| `themeMode?` | enum | – |
| `preConnectMessage?` | string | `Agent is listening, ask it a question` |
| `supportsChatInput?` | boolean | `true` |
| `supportsVideoInput?` | boolean | `true` |
| `supportsScreenShare?` | boolean | `true` |
| `isPreConnectBufferEnabled?` | boolean | `true` |
| `audioVisualizerType?` | enum | – |
| `audioVisualizerColor?` | `#${string}` | – |
| `audioVisualizerColorShift?` | number | – |
| `audioVisualizerBarCount?` | number | – |
| `audioVisualizerGridRowCount?` | number | – |
| `audioVisualizerGridColumnCount?` | number | – |
| `audioVisualizerRadialBarCount?` | number | – |
| `audioVisualizerRadialRadius?` | number | – |
| `audioVisualizerWaveLineWidth?` | number | – |

---

This document was rendered at 2026-07-02T09:17:43.488Z.
For the latest version of this document, see [https://docs.livekit.io/reference/components/agents-ui/block/agent-session-view-01.md](https://docs.livekit.io/reference/components/agents-ui/block/agent-session-view-01.md).

To explore all LiveKit documentation, see [llms.txt](https://docs.livekit.io/llms.txt).