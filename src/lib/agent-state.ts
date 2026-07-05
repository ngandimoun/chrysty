import type { AgentState } from '@livekit/components-react';

export type AppAgentPhase = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'error';

export const STATUS_LABELS: Record<AppAgentPhase, string> = {
  idle: '',
  connecting: 'Connecting…',
  listening: 'Listening…',
  thinking: 'Thinking…',
  speaking: 'Speaking…',
  error: 'Something went wrong',
};

export function toAuraState(phase: AppAgentPhase): AgentState {
  switch (phase) {
    case 'idle':
      return 'disconnected';
    case 'connecting':
      return 'thinking';
    case 'listening':
      return 'listening';
    case 'thinking':
      return 'thinking';
    case 'speaking':
      return 'speaking';
    case 'error':
      return 'failed';
    default:
      return 'disconnected';
  }
}

export const DEMO_CYCLE: AppAgentPhase[] = ['listening', 'thinking', 'speaking'];
