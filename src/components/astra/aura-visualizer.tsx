'use client';

import { useTheme } from 'next-themes';
import type { LocalAudioTrack } from 'livekit-client';

import { AgentAudioVisualizerAura } from '@/components/agent-audio-visualizer-aura';
import type { AppAgentPhase } from '@/lib/agent-state';
import { toAuraState } from '@/lib/agent-state';

/** Matches --brand in globals.css */
const DEFAULT_AURA_COLOR = '#1FD5F9' as const;
/** Matches --brand-listening in globals.css */
const LISTENING_AURA_COLOR = '#FF2D9E' as const;

interface AuraVisualizerProps {
  phase: AppAgentPhase;
  audioTrack?: LocalAudioTrack | null;
}

export function AuraVisualizer({ phase, audioTrack }: AuraVisualizerProps) {
  const { resolvedTheme } = useTheme();
  const isListening = phase === 'listening';
  const color = isListening ? LISTENING_AURA_COLOR : DEFAULT_AURA_COLOR;
  const colorShift = isListening ? 0.12 : 0.05;

  return (
    <AgentAudioVisualizerAura
      size="xl"
      color={color}
      colorShift={colorShift}
      state={toAuraState(phase)}
      themeMode={resolvedTheme === 'light' ? 'light' : 'dark'}
      audioTrack={audioTrack ?? undefined}
      className="size-72 max-w-[min(80vw,20rem)]"
      aria-label="Voice agent visualizer"
    />
  );
}
