LiveKit docs › Components › Audio visualizers › AgentAudioVisualizerAura

---

# Agent Audio Visualizer – Aura

> A shader based audio visualization of a pulsing energy field.

## Usage

**[AgentAudioVisualizerAura](https://docs.livekit.io/reference/components/agents-ui/component/agent-audio-visualizer-aura.md)** preview:

```tsx
'use client';

    
import { useTheme } from 'next-themes';
import { useSession, useAgent } from '@livekit/components-react';
import { AgentSessionProvider } from '@/components/agents-ui/agent-session-provider';
import { AgentAudioVisualizerAura } from '@/components/agents-ui/agent-audio-visualizer-aura';

const TOKEN_SOURCE = TokenSource.endpoint('/api/token');

export function Demo() {
  const { resolvedTheme: theme } = useTheme();
  const { audioTrack, state } = useAgent();

  return (
    <AgentAudioVisualizerAura
      size={{size}}
      color={{color}}
      colorShift={{colorShift}}
      state={state}
      themeMode={theme}
      audioTrack={audioTrack}
    />
  );
}

export default function DemoWrapper({ session }) {
  const session = useSession(TOKEN_SOURCE);

  return (
    <AgentSessionProvider session={session}>
      <Demo />
    </AgentSessionProvider>
  );
}
```

> ℹ️ **Note**
> 
> This component was designed in partnership with Unicorn Studio.

- **[Unicorn Studio](https://www.unicorn.studio/)**: Create jaw-dropping motion and interaction in minutes — no code. Embed with a few clicks.

## Features

- Visualize an agent's audio track
- Customize the color and color shift of the aura
- Select from five sizes: `icon`, `sm`, `md`, `lg`, and `xl`
- Responds to agent state with unique animations
- Light and dark mode support

## Installation

```bash
pnpm dlx shadcn@latest add @agents-ui/agent-audio-visualizer-aura

```

## Props

| Prop name | Type | Default |
| --------- | ---- | ------- |
| `size?` | enum | `lg` |
| `state?` | enum | `connecting` |
| `color?` | `#${string}` | `#1FD5F9` |
| `colorShift?` | number | `0.05` |
| `themeMode?` | enum | – |
| `audioTrack?` | LocalAudioTrack | RemoteAudioTrack | TrackReferenceOrPlaceholder | – |
| `ref?` | Ref<HTMLDivElement> | – |
| `...props?` | ComponentProps<'div'> | |

---

This document was rendered at 2026-07-02T09:15:52.147Z.
For the latest version of this document, see [https://docs.livekit.io/reference/components/agents-ui/component/agent-audio-visualizer-aura.md](https://docs.livekit.io/reference/components/agents-ui/component/agent-audio-visualizer-aura.md).

To explore all LiveKit documentation, see [llms.txt](https://docs.livekit.io/llms.txt).